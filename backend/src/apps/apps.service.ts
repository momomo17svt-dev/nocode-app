import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { RecordsService } from '../records/records.service';
import { getTemplate, listTemplates, type TemplateView, type TemplateDashboard } from './templates';
import { getSampleData, getSuiteSampleData } from './template-samples';
import { getSuite, listSuites } from './suites';
import { sanitizeDefinition } from '../common/app-definition.util';

@Injectable()
export class AppsService {
  constructor(
    private prisma: PrismaService,
    private permission: PermissionService,
    private records: RecordsService,
  ) {}

  /** ログインユーザーが閲覧可能なアプリのみ返す。 */
  async findAllVisible(userId: string, role: string) {
    const ids = await this.permission.visibleAppIds(userId, role);
    const where = ids === null ? {} : { id: { in: ids.length ? ids : ['__none__'] } };
    return this.prisma.app.findMany({
      where,
      include: { creator: { select: { loginId: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const app = await this.prisma.app.findUnique({
      where: { id },
      include: { creator: { select: { loginId: true, name: true } } },
    });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    return app;
  }

  async create(data: { name: string; description?: string }, creatorId: string) {
    return this.prisma.app.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        createdBy: creatorId,
      },
    });
  }

  /** 利用可能なテンプレート一覧（ユーザー定義 + ビルトイン）。 */
  async listTemplates() {
    const builtin = listTemplates().map((m) => ({ ...m, isUser: false }));
    const users = await this.prisma.userTemplate.findMany({ orderBy: { createdAt: 'desc' } });
    const userMeta = users.map((t) => {
      const def = (t.definition as any) || {};
      return {
        id: `user:${t.id}`,
        name: t.name,
        category: t.category,
        icon: t.icon,
        summary: t.summary || '',
        description: def.description || '',
        fields: (def.fields || []).map((f: any) => ({ label: f.label, fieldType: f.fieldType, required: !!f.required })),
        hasProcess: !!def.processConfig?.enabled,
        isUser: true,
      };
    });
    return [...userMeta, ...builtin];
  }

  /** 連携アプリ群（スイート）の一覧メタ。 */
  listSuites() {
    return listSuites();
  }

  /** 既存アプリをユーザー定義テンプレートとして保存（フォーム定義・プロセス・公開範囲をスナップショット）。 */
  async saveAsTemplate(
    appId: string,
    meta: { name: string; category?: string; icon?: string; summary?: string },
    creatorId: string,
  ) {
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      include: { fields: { orderBy: { createdAt: 'asc' } } },
    });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    const definition = {
      description: app.description,
      recordViewScope: app.recordViewScope,
      recordEditScope: app.recordEditScope,
      processConfig: app.processConfig,
      aiConfig: app.aiConfig,
      fields: app.fields.map((f) => ({
        fieldCode: f.fieldCode,
        fieldType: f.fieldType,
        label: f.label,
        required: f.required,
        settings: f.settings ?? {},
      })),
    };
    return this.prisma.userTemplate.create({
      data: {
        name: meta.name,
        category: meta.category?.trim() || 'マイテンプレート',
        icon: meta.icon || 'LayoutGrid',
        summary: meta.summary?.trim() || null,
        definition: definition as any,
        createdBy: creatorId,
      },
    });
  }

  async deleteUserTemplate(id: string, userId: string, role: string) {
    const ut = await this.prisma.userTemplate.findUnique({ where: { id } });
    if (!ut) throw new NotFoundException('テンプレートが見つかりません');
    if (ut.createdBy !== userId && role !== 'SystemAdmin') {
      throw new ForbiddenException('このテンプレートを削除する権限がありません');
    }
    await this.prisma.userTemplate.delete({ where: { id } });
    return { ok: true };
  }

  private async createFromUserTemplate(
    id: string,
    data: { name?: string; description?: string },
    creatorId: string,
  ) {
    const ut = await this.prisma.userTemplate.findUnique({ where: { id } });
    if (!ut) throw new NotFoundException('テンプレートが見つかりません');
    const def = (ut.definition as any) || {};
    return this.createFromDefinition({ ...def, name: ut.name }, data, creatorId);
  }

  /** 検証済みのアプリ定義からアプリを生成する（AI生成・ユーザーテンプレ共通）。 */
  async createFromDefinition(
    definition: any,
    data: { name?: string; description?: string },
    creatorId: string,
  ) {
    const d = sanitizeDefinition(definition);
    return this.prisma.app.create({
      data: {
        name: data.name?.trim() || d.name || '無題のアプリ',
        description: data.description?.trim() || d.description || null,
        status: 'draft',
        createdBy: creatorId,
        recordViewScope: d.recordViewScope,
        recordEditScope: d.recordEditScope,
        processConfig: (d.processConfig ?? undefined) as any,
        aiConfig: (d.aiConfig ?? undefined) as any,
        fields: {
          create: d.fields.map((f) => ({
            fieldCode: f.fieldCode,
            fieldType: f.fieldType,
            label: f.label,
            required: f.required,
            settings: f.settings as any,
          })),
        },
      },
    });
  }

  /** 検証済みのアプリ定義をユーザー定義テンプレートとして保存する。 */
  async saveDefinitionAsTemplate(
    meta: { name?: string; category?: string; icon?: string; summary?: string },
    definition: any,
    creatorId: string,
  ) {
    const d = sanitizeDefinition(definition);
    return this.prisma.userTemplate.create({
      data: {
        name: meta.name?.trim() || d.name || 'AI生成テンプレート',
        category: meta.category?.trim() || 'AIで作成',
        icon: meta.icon || 'Sparkles',
        summary: meta.summary?.trim() || d.description || null,
        definition: {
          description: d.description,
          recordViewScope: d.recordViewScope,
          recordEditScope: d.recordEditScope,
          processConfig: d.processConfig,
          aiConfig: d.aiConfig,
          fields: d.fields,
        } as any,
        createdBy: creatorId,
      },
    });
  }

  /**
   * テンプレートからアプリを生成する。フォーム定義・プロセス・公開範囲を一括で作成。
   * name/description は指定があれば上書き、なければテンプレートの既定値を使う。
   */
  async createFromTemplate(
    templateId: string,
    data: { name?: string; description?: string; withSamples?: boolean },
    creatorId: string,
  ) {
    if (templateId.startsWith('user:')) {
      return this.createFromUserTemplate(templateId.slice(5), data, creatorId);
    }
    const tpl = getTemplate(templateId);
    if (!tpl) throw new NotFoundException('テンプレートが見つかりません');
    const app = await this.prisma.app.create({
      data: {
        name: data.name?.trim() || tpl.name,
        description: data.description?.trim() || tpl.description,
        status: 'draft',
        createdBy: creatorId,
        recordViewScope: tpl.recordViewScope ?? 'all',
        recordEditScope: tpl.recordEditScope ?? 'all',
        processConfig: (tpl.processConfig ?? undefined) as any,
        reminderConfig: (tpl.reminderConfig ?? undefined) as any,
        aiConfig: (tpl.aiConfig ?? undefined) as any,
        reportConfig: (tpl.reportConfig ?? undefined) as any,
        fields: {
          create: tpl.fields.map((f) => ({
            fieldCode: f.fieldCode,
            fieldType: f.fieldType,
            label: f.label,
            required: f.required ?? false,
            settings: f.settings ?? {},
          })),
        },
      },
    });

    // 保存ビュー・ダッシュボードを自動生成（任意）。失敗してもアプリ作成は成功させる。
    await this.seedViewsAndDashboard(app.id, tpl, creatorId);

    // サンプルデータ投入（任意）。1件失敗してもアプリ作成は成功させる。
    if (data.withSamples) {
      for (const sample of getSampleData(templateId)) {
        try {
          // テンプレート同梱のサンプルはサーバ側で用意した値なので、外部入力向けの絞り込みは掛けない。
          await this.records.create(app.id, sample, creatorId, { trustedSource: true });
        } catch {
          /* サンプル投入失敗は無視 */
        }
      }
    }
    return app;
  }

  /**
   * テンプレ定義の views / dashboard を実レコードとして作成する。
   * 生成直後から かんばん/カレンダー/地図/集計 の各ビューが映えるようにする。
   * 失敗は握りつぶす（アプリ本体の作成は必ず成功させる方針）。
   */
  private async seedViewsAndDashboard(
    appId: string,
    tpl: { views?: TemplateView[]; dashboard?: TemplateDashboard },
    creatorId: string,
  ) {
    if (tpl.views?.length) {
      for (const v of tpl.views) {
        try {
          await this.prisma.view.create({
            data: {
              appId,
              name: v.name,
              isShared: true,
              createdBy: creatorId,
              columns: (v.columns ?? undefined) as any,
              conditions: (v.conditions ?? undefined) as any,
              sort: (v.sort ?? undefined) as any,
            },
          });
        } catch {
          /* ビュー作成失敗は無視 */
        }
      }
    }
    if (tpl.dashboard?.widgets?.length) {
      try {
        const widgets = tpl.dashboard.widgets.map((w) => ({
          ...w,
          id: randomUUID(),
          appId,
          size: w.size ?? (w.type === 'kpi' ? 'sm' : 'md'),
        }));
        const count = await this.prisma.dashboard.count({ where: { ownerId: creatorId } });
        await this.prisma.dashboard.create({
          data: {
            name: tpl.dashboard.name,
            ownerId: creatorId,
            isShared: true,
            access: { mode: 'shared', shares: [] } as any,
            layout: { widgets } as any,
            sortOrder: count,
          },
        });
      } catch {
        /* ダッシュボード作成失敗は無視 */
      }
    }
  }

  /**
   * 連携アプリ群（スイート）からアプリ一式を生成する。
   * メンバーを依存順に作成し、reference 項目の settings.refTemplate を実アプリIDへ解決して
   * settings.refAppId を埋める（アプリ間連携＋ルックアップを成立させる）。
   */
  async createFromSuite(
    suiteId: string,
    data: { withSamples?: boolean; allowDuplicate?: boolean },
    creatorId: string,
  ) {
    const suite = getSuite(suiteId);
    if (!suite) throw new NotFoundException('スイートが見つかりません');

    if (!data.allowDuplicate) {
      const names = suite.members.map((member) => member.name?.trim() || member.template.name);
      const existing = await this.prisma.app.findMany({
        where: { createdBy: creatorId, name: { in: names } },
        select: { name: true },
      });
      const counts = new Map<string, number>();
      for (const app of existing) counts.set(app.name, (counts.get(app.name) || 0) + 1);
      const completeSets = names.length > 0 ? Math.min(...names.map((name) => counts.get(name) || 0)) : 0;
      if (completeSets > 0) {
        throw new ConflictException({
          code: 'SUITE_ALREADY_EXISTS',
          message: `同じ連携アプリ群がすでに${completeSets}セットあります。重複して作成する場合は確認が必要です。`,
          existingSets: completeSets,
        });
      }
    }

    // memberKey → 作成済みアプリID のマップ。
    const idMap = new Map<string, string>();
    const created: { id: string; name: string; memberKey: string }[] = [];

    // 依存順（参照先→参照元）に作成。
    for (const member of suite.members) {
      const tpl = member.template;
      const app = await this.prisma.app.create({
        data: {
          name: member.name?.trim() || tpl.name,
          description: tpl.description,
          status: 'draft',
          createdBy: creatorId,
          recordViewScope: tpl.recordViewScope ?? 'all',
          recordEditScope: tpl.recordEditScope ?? 'all',
          processConfig: (tpl.processConfig ?? undefined) as any,
          reminderConfig: (tpl.reminderConfig ?? undefined) as any,
          aiConfig: (tpl.aiConfig ?? undefined) as any,
          reportConfig: (tpl.reportConfig ?? undefined) as any,
          fields: {
            create: tpl.fields.map((f) => ({
              fieldCode: f.fieldCode,
              fieldType: f.fieldType,
              label: f.label,
              required: f.required ?? false,
              settings: (f.settings ?? {}) as any,
            })),
          },
        },
      });
      idMap.set(member.key, app.id);
      created.push({ id: app.id, name: app.name, memberKey: member.key });
    }

    // reference 項目のシンボリック参照（refTemplate）を実IDへ解決。
    for (const member of suite.members) {
      const appId = idMap.get(member.key)!;
      for (const f of member.template.fields) {
        const refKey = f.settings?.refTemplate as string | undefined;
        if (f.fieldType !== 'reference' || !refKey) continue;
        const refAppId = idMap.get(refKey);
        if (!refAppId) continue;
        try {
          const field = await this.prisma.field.findFirst({ where: { appId, fieldCode: f.fieldCode } });
          if (!field) continue;
          const nextSettings = { ...(field.settings as any), refAppId };
          delete (nextSettings as any).refTemplate; // シンボリック値は残さない
          await this.prisma.field.update({ where: { id: field.id }, data: { settings: nextSettings as any } });
        } catch {
          /* 参照解決失敗は無視 */
        }
      }
      // ビュー・ダッシュボードを生成。
      await this.seedViewsAndDashboard(appId, member.template, creatorId);
    }

    // サンプル投入（任意）。参照先→参照元の順で投入し、関連レコード参照を実IDで繋ぐ。
    // サンプル側は __refs: { <referenceフィールドコード>: <参照先の表示値> } で親を指定する。
    if (data.withSamples) {
      // memberKey -> (表示値 -> { id, label })。子サンプルの __refs 解決に使う。
      const refIndex = new Map<string, Map<string, { id: string; label: string }>>();
      for (const member of suite.members) {
        const appId = idMap.get(member.key)!;
        // この member を参照する子が使う表示フィールド（登録キー）を収集。
        const indexFields = new Set<string>();
        for (const other of suite.members) {
          for (const f of other.template.fields) {
            if (f.fieldType === 'reference' && f.settings?.refTemplate === member.key && f.settings?.refDisplayField) {
              indexFields.add(f.settings.refDisplayField);
            }
          }
        }
        const index = new Map<string, { id: string; label: string }>();
        refIndex.set(member.key, index);

        for (const raw of getSuiteSampleData(suiteId, member.key)) {
          const sample: Record<string, any> = { ...raw };
          const refs = sample.__refs as Record<string, string> | undefined;
          delete sample.__refs;
          // この member の reference 項目を、親サンプルの表示値から実レコードへ解決。
          if (refs) {
            for (const f of member.template.fields) {
              if (f.fieldType !== 'reference') continue;
              const parentKey = f.settings?.refTemplate as string | undefined;
              const wantLabel = refs[f.fieldCode];
              if (!parentKey || !wantLabel) continue;
              const found = refIndex.get(parentKey)?.get(wantLabel);
              if (found) sample[f.fieldCode] = found;
            }
          }
          try {
            const rec = await this.records.create(appId, sample, creatorId, { trustedSource: true });
            // 子が参照する表示フィールドの値をキーに、作成レコードを登録。
            for (const df of indexFields) {
              const v = sample[df];
              if (v != null && v !== '') index.set(String(v), { id: rec.id, label: String(v) });
            }
          } catch {
            /* サンプル投入失敗は無視 */
          }
        }
      }
    }

    return { suiteId, apps: created };
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      recordViewScope?: string;
      recordEditScope?: string;
      recordScopeField?: string;
      creatorEditOwn?: boolean;
      creatorDeleteOwn?: boolean;
      processConfig?: any;
      reminderConfig?: any;
      aiConfig?: any;
      reportConfig?: any;
    },
  ) {
    return this.prisma.app.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.recordViewScope !== undefined ? { recordViewScope: data.recordViewScope } : {}),
        ...(data.recordEditScope !== undefined ? { recordEditScope: data.recordEditScope } : {}),
        // 空文字は無効化(null)。
        ...(data.recordScopeField !== undefined ? { recordScopeField: data.recordScopeField || null } : {}),
        ...(data.creatorEditOwn !== undefined ? { creatorEditOwn: data.creatorEditOwn } : {}),
        ...(data.creatorDeleteOwn !== undefined ? { creatorDeleteOwn: data.creatorDeleteOwn } : {}),
        ...(data.processConfig !== undefined ? { processConfig: data.processConfig } : {}),
        ...(data.reminderConfig !== undefined ? { reminderConfig: data.reminderConfig } : {}),
        ...(data.aiConfig !== undefined ? { aiConfig: data.aiConfig } : {}),
        ...(data.reportConfig !== undefined ? { reportConfig: data.reportConfig } : {}),
      },
    });
  }

  async setStatus(id: string, status: 'draft' | 'published') {
    return this.prisma.app.update({ where: { id }, data: { status } });
  }

  /**
   * 匿名公開フォームの有効/無効を切り替える。
   * 有効化時にトークン未発行（または regenerate 指定）なら新しいトークンを発行する。
   */
  async setPublicForm(id: string, enabled: boolean, regenerate?: boolean) {
    const app = await this.prisma.app.findUnique({
      where: { id },
      select: { publicFormToken: true },
    });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    let token = app.publicFormToken;
    if (enabled && (!token || regenerate)) {
      token = randomUUID();
    }
    const updated = await this.prisma.app.update({
      where: { id },
      data: { publicFormEnabled: enabled, publicFormToken: token },
      select: { publicFormEnabled: true, publicFormToken: true },
    });
    return updated;
  }

  /**
   * このアプリを reference（関連レコード参照）で参照している他アプリの一覧。
   * 各 reference フィールドの settings.refAppId が一致するものを集約する。
   */
  async referencingApps(appId: string): Promise<{ id: string; name: string; fieldLabel: string }[]> {
    const refFields = await this.prisma.field.findMany({ where: { fieldType: 'reference' } });
    const pointing = refFields.filter((f) => f.appId !== appId && (f.settings as any)?.refAppId === appId);
    if (!pointing.length) return [];
    const ids = [...new Set(pointing.map((f) => f.appId))];
    const apps = await this.prisma.app.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nameMap = new Map(apps.map((a) => [a.id, a.name]));
    return pointing
      .filter((f) => nameMap.has(f.appId))
      .map((f) => ({ id: f.appId, name: nameMap.get(f.appId)!, fieldLabel: f.label }));
  }

  /**
   * アプリ削除。他アプリから参照されている場合は force 指定が無ければ 409 で中断する
   * （削除すると参照元のリンクが切れるため）。
   */
  async remove(id: string, force = false) {
    if (!force) {
      const refs = await this.referencingApps(id);
      if (refs.length) {
        const names = [...new Set(refs.map((r) => r.name))];
        throw new ConflictException({
          message: `このアプリは他の${names.length}個のアプリ（${names.join('、')}）から関連レコード参照されています。削除すると参照リンクが切れます。`,
          referencingApps: refs,
        });
      }
    }
    return this.prisma.app.delete({ where: { id } });
  }

  /**
   * アプリを複製する。フィールド定義と公開設定をコピーし、レコードはコピーしない。
   */
  async duplicate(id: string, creatorId: string) {
    const source = await this.prisma.app.findUnique({
      where: { id },
      include: { fields: true, permissions: true },
    });
    if (!source) throw new NotFoundException('複製元アプリが見つかりません');

    return this.prisma.app.create({
      data: {
        name: `${source.name} (コピー)`,
        description: source.description,
        status: 'draft',
        createdBy: creatorId,
        fields: {
          create: source.fields.map((f) => ({
            fieldCode: f.fieldCode,
            fieldType: f.fieldType,
            label: f.label,
            required: f.required,
            settings: f.settings ?? undefined,
          })),
        },
        permissions: {
          create: source.permissions.map((p) => ({
            targetType: p.targetType,
            targetId: p.targetId,
            canView: p.canView,
            canAdd: p.canAdd,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
            canManage: p.canManage,
          })),
        },
      },
    });
  }
}
