import { BadRequestException, ConflictException, Injectable, NotFoundException, ForbiddenException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmbeddingService } from '../ai/embedding.service';
import { PermissionService } from '../permissions/permission.service';
import { evalFormula, evalRules, formatAutoNumber } from './compute.util';
import { MAX_IMPORT_ROWS, sanitizeRecordInput } from './record-input.util';
import { Prisma } from '@prisma/client';
import { AttachmentsService } from '../attachments/attachments.service';

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
export class RecordsService implements OnModuleInit, OnModuleDestroy {
  private trashTimer: NodeJS.Timeout | null = null;
  private trashInitialTimer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private embeddings: EmbeddingService,
    private permission: PermissionService,
    private attachments: AttachmentsService,
  ) {}

  onModuleInit() {
    this.trashInitialTimer = setTimeout(() => void this.purgeExpiredTrash(), 60_000);
    this.trashInitialTimer.unref();
    this.trashTimer = setInterval(() => void this.purgeExpiredTrash(), 6 * 60 * 60_000);
    this.trashTimer.unref();
  }

  onModuleDestroy() {
    if (this.trashInitialTimer) clearTimeout(this.trashInitialTimer);
    if (this.trashTimer) clearInterval(this.trashTimer);
  }

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

  /**
   * @param options.trustedSource サーバ内部で組み立てた値（複製など）は
   *   フィールド定義による絞り込みを掛けない。項目を削除したアプリの過去値まで
   *   複製時に落としてしまうため。外部入力では必ず既定(false)のまま使う。
   */
  async create(appId: string, dataJson: any, userId: string, options?: { trustedSource?: boolean }) {
    const record = await this.prisma.$transaction(async (tx) => {
      const fields = await tx.field.findMany({ where: { appId } });
      const clean = options?.trustedSource
        ? { ...(dataJson || {}) }
        : sanitizeRecordInput(fields, dataJson);
      const data = await this.computeFields(tx, appId, clean, true, undefined, fields);
      return tx.record.create({
        data: { appId, dataJson: data, createdBy: userId, updatedBy: userId },
      });
    });
    await this.notifyAssignments(appId, record.dataJson, null, userId, record.id);
    this.reindexRecordAsync(appId, record.id);
    return record;
  }

  /** 更新時に変更履歴を記録する。 */
  async update(id: string, dataJson: any, userId: string, expectedVersion: number, actor?: { canManage?: boolean }) {
    const existing = await this.prisma.record.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('レコードが見つかりません');
    if (existing.version !== expectedVersion) {
      throw new ConflictException('別のユーザーが先に更新しました。最新内容を読み込み直してから編集してください');
    }

    // 承認者ルーティング: 定義された遷移に承認者が設定されている場合、その本人(または管理権限)のみ実行可
    await this.assertProcessApprover(existing, dataJson, userId, !!actor?.canManage);

    const updated = await this.prisma.$transaction(async (tx) => {
      // 自動採番は既存値を保持しつつ、計算フィールドは再計算。
      // 絞り込みは今回届いた差分だけに掛ける（保存済みの値は既存フィールドが
      // 削除済みでもそのまま残す）。
      const fields = await tx.field.findMany({ where: { appId: existing.appId } });
      const patch = sanitizeRecordInput(fields, dataJson);
      const merged = { ...(existing.dataJson as any), ...patch };
      const data = await this.computeFields(tx, existing.appId, merged, false, existing.dataJson as any, fields);
      const changed = await tx.record.updateMany({
        where: { id, version: expectedVersion },
        data: { dataJson: data, updatedBy: userId, version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new ConflictException('別のユーザーが先に更新しました。最新内容を読み込み直してから編集してください');
      }
      await tx.recordHistory.create({
        data: {
          recordId: id,
          changedBy: userId,
          oldData: existing.dataJson as any,
          newData: data,
        },
      });
      return tx.record.findUniqueOrThrow({ where: { id } });
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
    // 配布先を書き込む項目はクライアント指定なので、そのアプリの user_select 項目であることを確かめる。
    const assignee = await this.prisma.field.findFirst({
      where: { appId, fieldCode: assigneeField, fieldType: 'user_select' },
    });
    if (!assignee) throw new BadRequestException('配布先を設定するユーザー選択項目が見つかりません');

    const uniq = Array.from(new Set(userIds)).filter(Boolean);
    let created = 0;
    for (const uid of uniq) {
      // 書き込む項目名はDBで実在を確認した値を使う（クライアント文字列をそのまま鍵にしない）。
      await this.create(appId, { ...baseData, [assignee.fieldCode]: uid }, actorId);
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
    preloadedFields?: { fieldCode: string; fieldType: string; settings: any }[],
  ): Promise<Record<string, any>> {
    const fields = preloadedFields ?? (await tx.field.findMany({ where: { appId } }));
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
    // 明細（サブテーブル）の行内計算をサーバ側でも確定する。
    // 画面は行内calcを埋めて送るが、API連携やインポート経由では欠けることがあり、
    // そのままだと親の sum(明細.列) が 0 になって合計が狂う。計算列は常にここで上書きする。
    for (const f of fields) {
      if (f.fieldType !== 'subtable') continue;
      const columns: any[] = (f.settings as any)?.columns || [];
      const calcColumns = columns.filter((c) => c.fieldType === 'calc');
      if (!calcColumns.length) continue;
      const rows = result[f.fieldCode];
      if (!Array.isArray(rows)) continue;
      result[f.fieldCode] = rows.map((row) => {
        const next = { ...(row || {}) };
        for (const c of calcColumns) {
          const s = c.settings || {};
          next[c.fieldCode] = s.mode === 'rules' ? evalRules(s, next) : s.formula ? evalFormula(s.formula, next) : '';
        }
        return next;
      });
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
    return this.create(existing.appId, data, userId, { trustedSource: true });
  }

  async remove(id: string, deletedBy: string) {
    const existing = await this.prisma.record.findUnique({
      where: { id },
      include: { comments: true, histories: true, attachments: true, app: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundException('レコードが見つかりません');
    const snapshot = {
      record: {
        id: existing.id,
        appId: existing.appId,
        createdBy: existing.createdBy,
        updatedBy: existing.updatedBy,
        dataJson: existing.dataJson,
        version: existing.version,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      },
      comments: existing.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
      histories: existing.histories.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
      attachmentIds: existing.attachments.map((a) => a.id),
    };
    const expiresAt = new Date(Date.now() + 30 * 86_400_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.deletedRecord.create({
        data: {
          originalId: existing.id,
          appId: existing.appId,
          appName: existing.app.name,
          snapshot: snapshot as any,
          deletedBy,
          expiresAt,
        },
      });
      await tx.record.delete({ where: { id } });
    });
    this.embeddings.removeRecord(id).catch((e) => console.error('[ai-index]', e?.message || e));
    return { id, trashed: true, expiresAt };
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
    deletedBy?: string,
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
    const rows = await this.prisma.record.findMany({
      where: {
        id: { in: targetIds },
        appId,
        ...(allowedCreatorIds ? { createdBy: { in: allowedCreatorIds } } : {}),
      },
      select: { id: true },
    });
    let deleted = 0;
    for (const row of rows) {
      await this.remove(row.id, deletedBy || 'system');
      deleted++;
    }
    return { deleted };
  }

  async listTrash(page = 1, pageSize = 50) {
    await this.purgeExpiredTrash();
    const size = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const requestedPage = Math.max(1, Math.floor(page));
    const total = await this.prisma.deletedRecord.count();
    const totalPages = Math.max(1, Math.ceil(total / size));
    const currentPage = Math.min(requestedPage, totalPages);
    const items = await this.prisma.deletedRecord.findMany({
      orderBy: { deletedAt: 'desc' },
      skip: (currentPage - 1) * size,
      take: size,
    });
    return { items, total, page: currentPage, pageSize: size, totalPages };
  }

  async restoreTrash(id: string, actorId: string) {
    const trash = await this.prisma.deletedRecord.findUnique({ where: { id } });
    if (!trash) throw new NotFoundException('ゴミ箱のレコードが見つかりません');
    const snapshot = trash.snapshot as any;
    const original = snapshot?.record;
    if (!original) throw new NotFoundException('復元データが壊れています');
    const app = await this.prisma.app.findUnique({ where: { id: original.appId } });
    if (!app) throw new NotFoundException('復元先のアプリが存在しません');
    if (await this.prisma.record.findUnique({ where: { id: original.id }, select: { id: true } })) {
      throw new ConflictException('同じIDのレコードが既に存在するため復元できません');
    }
    const creator = await this.prisma.user.findUnique({ where: { id: original.createdBy }, select: { id: true } });
    const updater = await this.prisma.user.findUnique({ where: { id: original.updatedBy }, select: { id: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.record.create({
        data: {
          id: original.id,
          appId: original.appId,
          createdBy: creator?.id || actorId,
          updatedBy: updater?.id || actorId,
          dataJson: original.dataJson,
          version: Number(original.version || 1) + 1,
          createdAt: new Date(original.createdAt),
          updatedAt: new Date(),
          comments: {
            create: (snapshot.comments || []).map((c: any) => ({
              id: c.id, userId: c.userId, comment: c.comment, createdAt: new Date(c.createdAt),
            })),
          },
          histories: {
            create: (snapshot.histories || []).map((h: any) => ({
              id: h.id, changedBy: h.changedBy, oldData: h.oldData, newData: h.newData, createdAt: new Date(h.createdAt),
            })),
          },
        },
      });
      const attachmentIds = (snapshot.attachmentIds || []).filter(Boolean);
      if (attachmentIds.length) {
        await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { recordId: original.id } });
      }
      await tx.deletedRecord.delete({ where: { id } });
    });
    this.reindexRecordAsync(original.appId, original.id);
    return { success: true, recordId: original.id, appId: original.appId };
  }

  async purgeTrash(id: string) {
    const trash = await this.prisma.deletedRecord.findUnique({ where: { id } });
    if (!trash) throw new NotFoundException('ゴミ箱のレコードが見つかりません');
    const attachmentIds: string[] = ((trash.snapshot as any)?.attachmentIds || []).filter(Boolean);
    for (const attachmentId of attachmentIds) {
      await this.attachments.remove(attachmentId).catch(() => undefined);
    }
    await this.prisma.deletedRecord.delete({ where: { id } });
    return { success: true };
  }

  async purgeExpiredTrash() {
    const expired = await this.prisma.deletedRecord.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const row of expired) await this.purgeTrash(row.id).catch(() => undefined);
    return { purged: expired.length };
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
    if ((rows?.length ?? 0) > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `一度に取り込めるのは${MAX_IMPORT_ROWS.toLocaleString()}行までです。ファイルを分割してください`,
      );
    }
    const fields = await this.prisma.field.findMany({ where: { appId } });
    const required = fields.filter((f) => f.required).map((f) => f.fieldCode);
    const validCodes = new Set(fields.map((f) => f.fieldCode));

    const errors: { row: number; message: string }[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      // 定義済みフィールドのみ取り込む（キーはフィールドコード＝`__proto__`もあり得るのでnullプロトタイプへ）
      const data: Record<string, any> = Object.create(null);
      for (const [k, v] of Object.entries(raw)) {
        if (validCodes.has(k)) data[k] = decodeCsvCell(v);
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

/**
 * Excel/表計算ソフトが「数式」として解釈しはじめる先頭文字。
 * この文字で始まるセルをそのまま出力すると、CSVを開いた人の環境で
 * 意図しない式(=cmd|... 等)が実行され得る(CSVインジェクション)。
 */
const CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;

function csvCell(v: any): string {
  const raw =
    v === null || v === undefined
      ? ''
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);
  // 数式化を防ぐためシングルクォートを前置する。Excelでは表示されず、
  // 本アプリへ取り込み直す際は decodeCsvCell が元に戻す。
  const s = CSV_FORMULA_LEAD.test(raw) ? "'" + raw : raw;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * csvCell が付けた無害化用シングルクォートだけを取り除く。
 * エクスポート→インポートの往復で値が変質しないようにするための対。
 */
function decodeCsvCell(v: any): any {
  if (typeof v !== 'string') return v;
  return v.startsWith("'") && CSV_FORMULA_LEAD.test(v.slice(1)) ? v.slice(1) : v;
}
