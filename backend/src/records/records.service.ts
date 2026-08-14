import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmbeddingService } from '../ai/embedding.service';
import { PermissionService } from '../permissions/permission.service';
import { evalFormula, evalRules, formatAutoNumber } from './compute.util';
import { Prisma } from '@prisma/client';

interface ListOptions {
  search?: string;
  filters?: Record<string, string>;
}

export interface RecordListCondition {
  field: string;
  op: 'contains' | 'eq' | 'ne' | 'gt' | 'lt' | 'empty' | 'notempty';
  value?: string;
}

export interface RecordPageOptions {
  page: number;
  pageSize: number;
  search?: string;
  conditions?: RecordListCondition[];
  sort?: { field: string; order: 'asc' | 'desc' } | null;
}

type TxClient = Prisma.TransactionClient;

@Injectable()
export class RecordsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private embeddings: EmbeddingService,
    private permission: PermissionService,
  ) {}

  /** AI埋め込みインデックスを非同期更新（失敗してもレコード操作は継続）。 */
  private reindexRecordAsync(appId: string, recordId: string) {
    this.embeddings.maybeIndexRecord(appId, recordId).catch((e) => console.error('[ai-index]', e?.message || e));
  }

  async getAppId(recordId: string): Promise<string> {
    return (await this.getRecordMeta(recordId)).appId;
  }

  /** レコードのアプリIDと作成者を返す（レコード単位認可で使用）。 */
  async getRecordMeta(recordId: string): Promise<{ appId: string; createdBy: string }> {
    const rec = await this.prisma.record.findUnique({
      where: { id: recordId },
      select: { appId: true, createdBy: true },
    });
    if (!rec) throw new NotFoundException('レコードが見つかりません');
    return rec;
  }

  /** 対象社員フィールド基準スコープ用: 指定レコードの該当フィールド値を返す。 */
  async getRecordFieldValue(recordId: string, field: string): Promise<string> {
    const rec = await this.prisma.record.findUnique({
      where: { id: recordId },
      select: { dataJson: true },
    });
    if (!rec) throw new NotFoundException('レコードが見つかりません');
    return String((rec.dataJson as any)?.[field] ?? '');
  }

  /**
   * @param allowedCreatorIds 指定時は createdBy がその集合に含まれるレコードのみ返す
   *   （owner=本人のみ / org=所属+配下メンバー）。null/未指定は全件。
   * @param fieldScope 指定時は対象社員(field)値が userIds に含まれるレコードのみ返す。
   */
  async findAll(
    appId: string,
    opts: ListOptions = {},
    allowedCreatorIds?: string[] | null,
    fieldScope?: { field: string; userIds: string[] } | null,
  ) {
    const records = await this.prisma.record.findMany({
      where: { appId, ...(allowedCreatorIds ? { createdBy: { in: allowedCreatorIds } } : {}) },
      include: {
        creator: { select: { loginId: true, name: true } },
        updater: { select: { loginId: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let filtered = records;

    // 対象社員フィールド基準の絞り込み（部署ツリー内の社員のレコードのみ）
    if (fieldScope) {
      const allow = new Set(fieldScope.userIds);
      filtered = filtered.filter((r) => allow.has(String((r.dataJson as any)?.[fieldScope.field] ?? '')));
    }

    // フィールド別フィルター（完全一致を含む部分一致）
    if (opts.filters) {
      for (const [code, val] of Object.entries(opts.filters)) {
        if (!val) continue;
        filtered = filtered.filter((r) => {
          const data = r.dataJson as Record<string, any>;
          return String(data?.[code] ?? '').includes(val);
        });
      }
    }

    // キーワード検索（全フィールド横断）
    if (opts.search) {
      const kw = opts.search.toLowerCase();
      filtered = filtered.filter((r) => {
        const data = r.dataJson as Record<string, any>;
        return Object.values(data ?? {}).some((v) =>
          String(v ?? '').toLowerCase().includes(kw),
        );
      });
    }

    return filtered;
  }

  /**
   * 一覧タブ向けのサーバー側ページ取得。検索・絞り込み・並び替えをPostgreSQLで実行し、
   * レコード件数が増えても全件をNode.js/ブラウザへ転送しない。
   */
  async findPage(
    appId: string,
    opts: RecordPageOptions,
    allowedCreatorIds?: string[] | null,
    fieldScope?: { field: string; userIds: string[] } | null,
  ) {
    const page = Math.max(1, Math.floor(opts.page));
    const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize)));
    const clauses: Prisma.Sql[] = [Prisma.sql`r."appId" = ${appId}`];

    if (allowedCreatorIds) {
      clauses.push(
        allowedCreatorIds.length
          ? Prisma.sql`r."createdBy" IN (${Prisma.join(allowedCreatorIds)})`
          : Prisma.sql`FALSE`,
      );
    }
    if (fieldScope) {
      const scopedValue = Prisma.sql`COALESCE(r."dataJson" ->> ${fieldScope.field}, '')`;
      clauses.push(
        fieldScope.userIds.length
          ? Prisma.sql`${scopedValue} IN (${Prisma.join(fieldScope.userIds)})`
          : Prisma.sql`FALSE`,
      );
    }
    if (opts.search?.trim()) {
      clauses.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM jsonb_each_text(r."dataJson") AS entry
          WHERE entry.value ILIKE ${`%${opts.search.trim()}%`}
        )`,
      );
    }
    for (const condition of (opts.conditions || []).slice(0, 20)) {
      clauses.push(this.recordConditionSql(condition));
    }

    const whereSql = Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
    const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Record" r ${whereSql}`,
    );
    const total = Number(countRows[0]?.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;
    const orderSql = await this.recordOrderSql(appId, opts.sort);
    const idRows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT r.id
        FROM "Record" r
        ${whereSql}
        ORDER BY ${orderSql}, r."createdAt" DESC, r.id ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
    );
    const ids = idRows.map((row) => row.id);
    const records = ids.length
      ? await this.prisma.record.findMany({
          where: { id: { in: ids } },
          include: {
            creator: { select: { loginId: true, name: true } },
            updater: { select: { loginId: true, name: true } },
          },
        })
      : [];
    const byId = new Map(records.map((record) => [record.id, record]));
    return {
      items: ids.map((id) => byId.get(id)).filter(Boolean),
      total,
      page: currentPage,
      pageSize,
      totalPages,
    };
  }

  private recordConditionSql(condition: RecordListCondition): Prisma.Sql {
    const valueSql = Prisma.sql`COALESCE(r."dataJson" ->> ${condition.field}, '')`;
    const value = String(condition.value ?? '');
    switch (condition.op) {
      case 'contains':
        return Prisma.sql`${valueSql} ILIKE ${`%${value}%`}`;
      case 'eq':
        return Prisma.sql`${valueSql} = ${value}`;
      case 'ne':
        return Prisma.sql`${valueSql} <> ${value}`;
      case 'empty':
        return Prisma.sql`${valueSql} = ''`;
      case 'notempty':
        return Prisma.sql`${valueSql} <> ''`;
      case 'gt':
      case 'lt': {
        const number = Number(value);
        if (!Number.isFinite(number)) return Prisma.sql`FALSE`;
        const numericSql = Prisma.sql`CASE WHEN ${valueSql} ~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN (${valueSql})::numeric ELSE 0 END`;
        return condition.op === 'gt'
          ? Prisma.sql`${numericSql} > ${number}`
          : Prisma.sql`${numericSql} < ${number}`;
      }
      default:
        return Prisma.sql`TRUE`;
    }
  }

  private async recordOrderSql(
    appId: string,
    sort?: { field: string; order: 'asc' | 'desc' } | null,
  ): Promise<Prisma.Sql> {
    if (!sort?.field) return Prisma.sql`r."createdAt" DESC`;
    const field = await this.prisma.field.findUnique({
      where: { appId_fieldCode: { appId, fieldCode: sort.field } },
      select: { fieldType: true },
    });
    if (!field) return Prisma.sql`r."createdAt" DESC`;
    const direction = Prisma.raw(sort.order === 'asc' ? 'ASC' : 'DESC');
    const valueSql = Prisma.sql`COALESCE(r."dataJson" ->> ${sort.field}, '')`;
    if (field.fieldType === 'number' || field.fieldType === 'calc') {
      return Prisma.sql`CASE WHEN ${valueSql} ~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN (${valueSql})::numeric ELSE NULL END ${direction} NULLS LAST`;
    }
    return Prisma.sql`${valueSql} ${direction}`;
  }

  async findOne(id: string) {
    const record = await this.prisma.record.findUnique({
      where: { id },
      include: {
        creator: { select: { loginId: true, name: true } },
        updater: { select: { loginId: true, name: true } },
        comments: { orderBy: { createdAt: 'asc' } },
        histories: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!record) throw new NotFoundException('レコードが見つかりません');

    // コメント/履歴のユーザーIDをログインIDに解決
    const userIds = Array.from(
      new Set([
        ...record.comments.map((c) => c.userId),
        ...record.histories.map((h) => h.changedBy),
      ]),
    );
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, loginId: true, name: true },
    });
    // 氏名があれば氏名、なければログインIDで表示。
    const nameOf = (uid: string) => {
      const u = users.find((x) => x.id === uid);
      return u ? u.name?.trim() || u.loginId : '不明';
    };

    return {
      ...record,
      comments: record.comments.map((c) => ({ ...c, loginId: nameOf(c.userId) })),
      histories: record.histories.map((h) => ({ ...h, loginId: nameOf(h.changedBy) })),
    };
  }

  async create(appId: string, dataJson: any, userId: string) {
    const record = await this.prisma.$transaction(async (tx) => {
      const data = await this.computeFields(tx, appId, dataJson, true);
      return tx.record.create({
        data: { appId, dataJson: data, createdBy: userId, updatedBy: userId },
      });
    });
    await this.notifyAssignments(appId, record.dataJson, null, userId, record.id);
    this.reindexRecordAsync(appId, record.id);
    return record;
  }

  /** 更新時に変更履歴を記録する。 */
  async update(id: string, dataJson: any, userId: string, actor?: { canManage?: boolean }) {
    const existing = await this.prisma.record.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('レコードが見つかりません');

    // 承認者ルーティング: 定義された遷移に承認者が設定されている場合、その本人(または管理権限)のみ実行可
    await this.assertProcessApprover(existing, dataJson, userId, !!actor?.canManage);

    const updated = await this.prisma.$transaction(async (tx) => {
      // 自動採番は既存値を保持しつつ、計算フィールドは再計算
      const merged = { ...(existing.dataJson as any), ...dataJson };
      const data = await this.computeFields(tx, existing.appId, merged, false, existing.dataJson as any);
      await tx.recordHistory.create({
        data: {
          recordId: id,
          changedBy: userId,
          oldData: existing.dataJson as any,
          newData: data,
        },
      });
      return tx.record.update({
        where: { id },
        data: { dataJson: data, updatedBy: userId },
      });
    });
    await this.notifyAssignments(existing.appId, updated.dataJson, existing.dataJson, userId, id);
    await this.notifyApprovers(existing.appId, updated.dataJson, existing.dataJson, userId, id);
    this.reindexRecordAsync(existing.appId, id);
    return updated;
  }

  /** 承認者ルーティングの実行可否を検証（指定承認者のみ／管理権限は常に可）。 */
  private async assertProcessApprover(existing: any, dataJson: any, userId: string, canManage: boolean): Promise<void> {
    const app = await this.prisma.app.findUnique({ where: { id: existing.appId }, select: { processConfig: true } });
    const proc: any = app?.processConfig;
    if (!proc?.enabled || !proc.statusField) return;
    const sf = proc.statusField;
    if (!(sf in (dataJson || {}))) return;
    const oldStatus = (existing.dataJson as any)?.[sf];
    const newStatus = dataJson[sf];
    if (oldStatus === newStatus) return;
    const action = (proc.actions || []).find((a: any) => a.from === oldStatus && a.to === newStatus);
    if (!action?.approver) return;
    if (canManage) return;
    const approverUserId = (existing.dataJson as any)?.[action.approver];
    if (approverUserId && String(approverUserId) !== userId) {
      throw new ForbiddenException('この操作は指定の承認者のみ実行できます');
    }
  }

  /** 遷移後の新ステータスから出る承認者付きアクションがあれば、その承認者へ「承認待ち」通知。 */
  private async notifyApprovers(appId: string, newData: any, prevData: any, actorId: string, recordId: string): Promise<void> {
    try {
      const app = await this.prisma.app.findUnique({ where: { id: appId }, select: { processConfig: true, name: true } });
      const proc: any = app?.processConfig;
      if (!proc?.enabled || !proc.statusField) return;
      const sf = proc.statusField;
      const oldStatus = prevData?.[sf];
      const newStatus = newData?.[sf];
      if (oldStatus === newStatus) return;
      const nextActions = (proc.actions || []).filter((a: any) => a.from === newStatus && a.approver);
      for (const a of nextActions) {
        const approverId = newData?.[a.approver];
        if (approverId) {
          await this.notifications.notify({
            userId: String(approverId),
            type: 'status_change',
            title: `「${app?.name ?? 'アプリ'}」で承認待ちのレコードがあります`,
            appId,
            recordId,
            actorId,
          });
        }
      }
    } catch {
      /* 通知失敗は本処理に影響させない */
    }
  }

  /**
   * user_select フィールドに新たに設定されたユーザーへ「担当に設定された」通知を送る。
   * prevData=null は新規作成（設定済みすべてが対象）。
   */
  private async notifyAssignments(
    appId: string,
    data: any,
    prevData: any,
    actorId: string,
    recordId: string,
  ): Promise<void> {
    try {
      const fields = await this.prisma.field.findMany({ where: { appId } });
      const userFields = fields.filter((f) => f.fieldType === 'user_select');
      if (userFields.length === 0) return;
      const app = await this.prisma.app.findUnique({ where: { id: appId }, select: { name: true } });
      for (const f of userFields) {
        const val = data?.[f.fieldCode];
        const prev = prevData?.[f.fieldCode];
        if (val && val !== prev && String(val) !== actorId) {
          await this.notifications.notify({
            userId: String(val),
            type: 'assignment',
            title: `「${app?.name ?? 'アプリ'}」であなたが「${f.label}」に設定されました`,
            appId,
            recordId,
            actorId,
          });
        }
      }
    } catch {
      /* 通知失敗は本処理に影響させない */
    }
  }

  /**
   * 一括配布: 指定ユーザーごとに assigneeField を本人に設定したレコードを作成する。
   * （アンケート・依頼の一斉割当用）
   */
  async bulkDistribute(
    appId: string,
    assigneeField: string,
    userIds: string[],
    baseData: Record<string, any>,
    actorId: string,
  ): Promise<{ created: number }> {
    const uniq = Array.from(new Set(userIds)).filter(Boolean);
    let created = 0;
    for (const uid of uniq) {
      await this.create(appId, { ...baseData, [assigneeField]: uid }, actorId);
      created++;
    }
    return { created };
  }

  /** 計算フィールド・自動採番の値をサーバ側で確定する。 */
  private async computeFields(
    tx: TxClient,
    appId: string,
    input: Record<string, any>,
    isCreate: boolean,
    existingData?: Record<string, any>,
  ): Promise<Record<string, any>> {
    const fields = await tx.field.findMany({ where: { appId } });
    const result: Record<string, any> = { ...input };

    // 自動採番: 新規作成時は未設定なら採番。更新時はクライアントによる上書きを無視し保存済み値を維持。
    for (const f of fields) {
      if (f.fieldType !== 'auto_number') continue;
      if (isCreate) {
        if (!result[f.fieldCode]) {
          const n = await this.nextSequence(tx, appId, f.fieldCode);
          result[f.fieldCode] = formatAutoNumber(n, f.settings);
        }
      } else if (existingData && f.fieldCode in existingData) {
        result[f.fieldCode] = existingData[f.fieldCode];
      }
    }
    // 計算フィールド（常に再計算）。fields配列順に逐次評価するので依存は順序で表現する。
    for (const f of fields) {
      if (f.fieldType === 'calc') {
        const s = (f.settings as any) || {};
        if (s.mode === 'rules') {
          result[f.fieldCode] = evalRules(s, result);
        } else {
          const formula = s.formula || '';
          result[f.fieldCode] = formula ? evalFormula(formula, result) : '';
        }
      }
    }
    return result;
  }

  /**
   * アプリ×フィールド単位の連番を採番する（Setting テーブルにカウンタ保持）。
   * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` で「作成 or 加算」を1文に集約し、
   * 行ロックを伴って原子的に採番する（同時 create でも連番が重複しない）。
   * 旧形式の値 {n: 5} とも互換（jsonb の n を数値として加算）。
   */
  private async nextSequence(tx: TxClient, appId: string, fieldCode: string): Promise<number> {
    const key = `autonumber:${appId}:${fieldCode}`;
    const rows: { n: number }[] = await tx.$queryRawUnsafe(
      `INSERT INTO "Setting" (id, key, value, "updatedAt")
       VALUES ($1, $2, '{"n": 1}'::jsonb, now())
       ON CONFLICT (key) DO UPDATE
         SET value = jsonb_set(
               "Setting".value,
               '{n}',
               to_jsonb(COALESCE(("Setting".value->>'n')::int, 0) + 1)
             ),
             "updatedAt" = now()
       RETURNING (value->>'n')::int AS n`,
      randomUUID(),
      key,
    );
    return Number(rows[0].n);
  }

  /**
   * このレコードを参照している他アプリのレコード（逆引き）。
   * reference フィールドの値は { id, label } 形式で保存される。
   * @returns アプリ×参照フィールドごとのグループ配列（appId は呼び出し側で閲覧権限フィルタする）
   */
  async findRelated(recordId: string, viewer?: { userId: string; role: string }) {
    const meta = await this.getRecordMeta(recordId);
    const refFields = await this.prisma.field.findMany({ where: { fieldType: 'reference' } });
    const pointing = refFields.filter((f) => (f.settings as any)?.refAppId === meta.appId);

    const groups: {
      appId: string;
      appName: string;
      fieldLabel: string;
      records: { id: string; title: string }[];
    }[] = [];

    for (const f of pointing) {
      const srcApp = await this.prisma.app.findUnique({
        where: { id: f.appId },
        select: { id: true, name: true },
      });
      if (!srcApp) continue;
      const srcFields = await this.prisma.field.findMany({ where: { appId: f.appId } });
      const titleField =
        srcFields.find((sf) => sf.fieldType === 'text') ||
        srcFields.find((sf) => !['file', 'reference'].includes(sf.fieldType));
      // owner/org 公開範囲の参照元アプリでは、非特権ユーザーに見えるレコードのみ返す。
      const allowed = viewer
        ? await this.permission.allowedCreatorIds(f.appId, viewer.userId, viewer.role, 'view')
        : null;
      const recs = await this.prisma.record.findMany({
        where: { appId: f.appId, ...(allowed ? { createdBy: { in: allowed } } : {}) },
        orderBy: { updatedAt: 'desc' },
      });
      const matched = recs.filter((r) => (r.dataJson as any)?.[f.fieldCode]?.id === recordId);
      if (matched.length === 0) continue;
      groups.push({
        appId: srcApp.id,
        appName: srcApp.name,
        fieldLabel: f.label,
        records: matched.map((r) => ({
          id: r.id,
          title:
            (titleField && String((r.dataJson as any)?.[titleField.fieldCode] ?? '')) ||
            '(無題のレコード)',
        })),
      });
    }
    return groups;
  }

  /**
   * 指定アプリのレコード群（targetIds）を参照している他アプリのレコード総数（削除前の警告用）。
   * reference フィールドの値 { id, label } の id が対象に含まれる件数を数える。
   */
  async countReferencing(targetAppId: string, targetIds: string[]): Promise<number> {
    if (!targetIds.length) return 0;
    const idSet = new Set(targetIds);
    const refFields = await this.prisma.field.findMany({ where: { fieldType: 'reference' } });
    const pointing = refFields.filter((f) => (f.settings as any)?.refAppId === targetAppId);
    let count = 0;
    for (const f of pointing) {
      const recs = await this.prisma.record.findMany({ where: { appId: f.appId }, select: { dataJson: true } });
      count += recs.filter((r) => idSet.has((r.dataJson as any)?.[f.fieldCode]?.id)).length;
    }
    return count;
  }

  /** 指定IDのうち、実在するレコードIDのみ返す（参照のリンク切れ検出用）。 */
  async existingIds(ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.record.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** レコードを複製する。自動採番はクリアして再採番、計算フィールドは再計算される。 */
  async duplicate(id: string, userId: string) {
    const existing = await this.prisma.record.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('レコードが見つかりません');
    const fields = await this.prisma.field.findMany({ where: { appId: existing.appId } });
    const data: Record<string, any> = { ...(existing.dataJson as any) };
    for (const f of fields) {
      if (f.fieldType === 'auto_number') delete data[f.fieldCode];
    }
    return this.create(existing.appId, data, userId);
  }

  async remove(id: string) {
    const deleted = await this.prisma.record.delete({ where: { id } });
    this.embeddings.removeRecord(id).catch((e) => console.error('[ai-index]', e?.message || e));
    return deleted;
  }

  /**
   * 一括削除。allowedCreatorIds 指定時はその作成者のレコードのみ削除（owner/org公開範囲用）。
   * fieldScope 指定時は対象社員(field)値が範囲内のレコードのみに限定する。
   */
  async bulkRemove(
    appId: string,
    ids: string[],
    allowedCreatorIds?: string[] | null,
    fieldScope?: { field: string; userIds: string[] } | null,
  ) {
    let targetIds = ids;
    // 対象社員フィールド基準: 範囲内のレコードIDだけに絞ってから削除する。
    if (fieldScope) {
      const allow = new Set(fieldScope.userIds);
      const rows = await this.prisma.record.findMany({
        where: { id: { in: ids }, appId },
        select: { id: true, dataJson: true },
      });
      targetIds = rows
        .filter((r) => allow.has(String((r.dataJson as any)?.[fieldScope.field] ?? '')))
        .map((r) => r.id);
    }
    if (targetIds.length === 0) return { deleted: 0 };
    const res = await this.prisma.record.deleteMany({
      where: {
        id: { in: targetIds },
        appId,
        ...(allowedCreatorIds ? { createdBy: { in: allowedCreatorIds } } : {}),
      },
    });
    this.embeddings.removeRecords(targetIds).catch((e) => console.error('[ai-index]', e?.message || e));
    return { deleted: res.count };
  }

  async addComment(recordId: string, userId: string, comment: string) {
    const created = await this.prisma.recordComment.create({
      data: { recordId, userId, comment },
    });
    await this.notifyMentions(recordId, userId, comment);
    return created;
  }

  /** コメント本文の @loginId を解決して該当ユーザーへメンション通知。 */
  private async notifyMentions(recordId: string, actorId: string, comment: string): Promise<void> {
    try {
      const matches = comment.match(/@([A-Za-z0-9_.-]+)/g);
      if (!matches?.length) return;
      const logins = Array.from(new Set(matches.map((m) => m.slice(1))));
      const users = await this.prisma.user.findMany({
        where: { loginId: { in: logins } },
        select: { id: true },
      });
      if (users.length === 0) return;
      const meta = await this.prisma.record.findUnique({ where: { id: recordId }, select: { appId: true } });
      const app = meta
        ? await this.prisma.app.findUnique({ where: { id: meta.appId }, select: { name: true } })
        : null;
      await this.notifications.notifyMany(
        users.map((u) => u.id),
        {
          type: 'mention',
          title: `「${app?.name ?? 'アプリ'}」のコメントでメンションされました`,
          body: comment.slice(0, 140),
          appId: meta?.appId,
          recordId,
          actorId,
        },
      );
    } catch {
      /* 通知失敗は本処理に影響させない */
    }
  }

  /** CSV文字列を生成（RFC4180準拠のエスケープ + Excel向けBOM）。 */
  async exportCsv(appId: string): Promise<string> {
    const fields = await this.prisma.field.findMany({
      where: { appId },
      orderBy: { createdAt: 'asc' },
    });
    const records = await this.prisma.record.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
    });

    const codes = fields.map((f) => f.fieldCode);
    const labels = fields.map((f) => f.label);

    const header = ['レコードID', ...labels].map(csvCell).join(',');
    const lines = records.map((r) => {
      const data = r.dataJson as Record<string, any>;
      return [r.id, ...codes.map((c) => data?.[c])].map(csvCell).join(',');
    });

    return '﻿' + [header, ...lines].join('\r\n');
  }

  /**
   * CSVインポート。フロントでパース済みの行配列を受け取り、必須チェック後に作成する。
   * @returns 成功件数とエラー行
   */
  async importRows(
    appId: string,
    rows: Record<string, any>[],
    userId: string,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const fields = await this.prisma.field.findMany({ where: { appId } });
    const required = fields.filter((f) => f.required).map((f) => f.fieldCode);
    const validCodes = new Set(fields.map((f) => f.fieldCode));

    const errors: { row: number; message: string }[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      // 定義済みフィールドのみ取り込む
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (validCodes.has(k)) data[k] = v;
      }
      const missing = required.filter((c) => data[c] === undefined || data[c] === '');
      if (missing.length > 0) {
        errors.push({ row: i + 1, message: `必須項目が未入力: ${missing.join(', ')}` });
        continue;
      }
      // 計算フィールド・自動採番を適用して作成
      await this.create(appId, data, userId);
      created++;
    }
    return { created, errors };
  }
}

function csvCell(v: any): string {
  const s =
    v === null || v === undefined
      ? ''
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
