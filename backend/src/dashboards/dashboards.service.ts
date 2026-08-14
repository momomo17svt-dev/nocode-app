import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { CreateDashboardDto, UpdateDashboardDto } from './dto/dashboard.dto';

/** フロントの lib/colors.ts と同一パレット（同じステータスが同じ色になるよう一致させる）。 */
const CHART_PALETTE = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#3b82f6',
];
const NEUTRAL_COLOR = '#94a3b8';
const paletteColor = (i: number) => CHART_PALETTE[((i % CHART_PALETTE.length) + CHART_PALETTE.length) % CHART_PALETTE.length];

type WidgetType = 'chart' | 'kpi' | 'list' | 'mytasks' | 'map';
interface Filter { field: string; op: string; value?: string }
interface Widget {
  id: string;
  type: WidgetType;
  title?: string;
  size?: string;
  appId?: string;
  chartType?: string;
  groupField?: string;
  metric?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  valueField?: string;
  kpiMode?: 'count' | 'sum' | 'avg' | 'open' | 'rate';
  columns?: string[];
  limit?: number;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  filters?: Filter[];
}

interface FieldLite { fieldCode: string; fieldType: string; label: string; settings: any }

@Injectable()
export class DashboardsService {
  constructor(
    private prisma: PrismaService,
    private permission: PermissionService,
  ) {}

  /** 自分が閲覧できるダッシュボード（所有 + 共有先 + 全員公開）を返す。 */
  async list(userId: string, role: string) {
    const groupIds = await this.userGroupIds(userId);
    const rows = await this.prisma.dashboard.findMany({
      where: { OR: [{ ownerId: userId }, { isShared: true }] },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows
      .filter((d) => this.canView(d, userId, role, groupIds))
      .map((d) => this.toDto(d, userId, role, groupIds));
  }

  async create(userId: string, role: string, dto: CreateDashboardDto) {
    const access = this.sanitizeAccess(dto.access, dto.isShared, role);
    const count = await this.prisma.dashboard.count({ where: { ownerId: userId } });
    const row = await this.prisma.dashboard.create({
      data: {
        name: dto.name?.trim() || '無題のダッシュボード',
        ownerId: userId,
        isShared: access.mode !== 'private',
        access: access as any,
        layout: { widgets: dto.widgets ?? [] } as any,
        sortOrder: count,
      },
    });
    const groupIds = await this.userGroupIds(userId);
    return this.toDto(row, userId, role, groupIds);
  }

  async update(id: string, userId: string, role: string, dto: UpdateDashboardDto) {
    const row = await this.prisma.dashboard.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('ダッシュボードが見つかりません');
    const groupIds = await this.userGroupIds(userId);

    const wantsManage = dto.name !== undefined || dto.access !== undefined || dto.isShared !== undefined;
    if (wantsManage && !this.canManage(row, userId, role)) {
      throw new ForbiddenException('このダッシュボードの設定を変更する権限がありません');
    }
    if (dto.widgets !== undefined && !this.canEditWidgets(row, userId, role, groupIds)) {
      throw new ForbiddenException('このダッシュボードを編集する権限がありません');
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim() || '無題のダッシュボード';
    if (dto.widgets !== undefined) data.layout = { widgets: dto.widgets };
    if (dto.access !== undefined || dto.isShared !== undefined) {
      const access = this.sanitizeAccess(dto.access ?? this.normalizeAccess(row), dto.isShared, role);
      data.access = access;
      data.isShared = access.mode !== 'private';
    }
    const updated = await this.prisma.dashboard.update({ where: { id }, data });
    return this.toDto(updated, userId, role, groupIds);
  }

  async remove(id: string, userId: string, role: string) {
    const row = await this.prisma.dashboard.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('ダッシュボードが見つかりません');
    if (!this.canManage(row, userId, role)) throw new ForbiddenException('このダッシュボードを削除する権限がありません');
    await this.prisma.dashboard.delete({ where: { id } });
    return { ok: true };
  }

  // ===== アクセス権 =====
  private async userGroupIds(userId: string): Promise<string[]> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { groupId: true } });
    return u?.groupId ? [u.groupId] : [];
  }

  /** 全員公開(public)はシステム管理者・アプリ作成者のみ。指定共有(shared)は所有者なら可。 */
  private canShare(role: string) {
    return role === 'SystemAdmin' || role === 'AppCreator';
  }

  /** 保存値を正規化。public権限が無ければ shared へ降格。shares を検証。 */
  private sanitizeAccess(access: any, isShared: boolean | undefined, role: string) {
    let mode: string = access?.mode || (isShared ? 'public' : 'private');
    if (!['private', 'shared', 'public'].includes(mode)) mode = 'private';
    if (mode === 'public' && !this.canShare(role)) mode = access?.shares?.length ? 'shared' : 'private';
    const shares = Array.isArray(access?.shares)
      ? access.shares
          .filter((s: any) => (s?.targetType === 'User' || s?.targetType === 'Group') && s?.targetId)
          .map((s: any) => ({ targetType: s.targetType, targetId: String(s.targetId), canEdit: !!s.canEdit }))
      : [];
    return { mode: mode as 'private' | 'shared' | 'public', shares };
  }

  /** 既存行（access未設定）も含めて access オブジェクトへ正規化。 */
  private normalizeAccess(row: any): { mode: 'private' | 'shared' | 'public'; shares: any[] } {
    const a = row?.access;
    if (a && typeof a === 'object' && a.mode) {
      return { mode: a.mode, shares: Array.isArray(a.shares) ? a.shares : [] };
    }
    return { mode: row?.isShared ? 'public' : 'private', shares: [] };
  }

  private matchesShare(s: any, userId: string, groupIds: string[]): boolean {
    if (s.targetType === 'User') return s.targetId === userId;
    if (s.targetType === 'Group') return groupIds.includes(s.targetId);
    return false;
  }

  private canView(row: any, userId: string, role: string, groupIds: string[]): boolean {
    if (row.ownerId === userId || role === 'SystemAdmin') return true;
    const acc = this.normalizeAccess(row);
    if (acc.mode === 'public') return true;
    if (acc.mode === 'shared') return acc.shares.some((s) => this.matchesShare(s, userId, groupIds));
    return false;
  }

  /** 名前・共有設定・削除（管理操作）は所有者・システム管理者のみ。 */
  private canManage(row: any, userId: string, role: string): boolean {
    return row.ownerId === userId || role === 'SystemAdmin';
  }

  /** ウィジェットの編集は、所有者・管理者・共有先で編集可フラグのあるユーザー。 */
  private canEditWidgets(row: any, userId: string, role: string, groupIds: string[]): boolean {
    if (this.canManage(row, userId, role)) return true;
    const acc = this.normalizeAccess(row);
    if (acc.mode === 'shared') return acc.shares.some((s) => this.matchesShare(s, userId, groupIds) && s.canEdit);
    return false;
  }

  private toDto(row: any, userId: string, role: string, groupIds: string[]) {
    const layout = (row.layout as any) || {};
    const access = this.normalizeAccess(row);
    return {
      id: row.id,
      name: row.name,
      isShared: row.isShared,
      access,
      ownerId: row.ownerId,
      isOwner: row.ownerId === userId,
      canManage: this.canManage(row, userId, role),
      canEdit: this.canEditWidgets(row, userId, role, groupIds),
      widgets: Array.isArray(layout.widgets) ? layout.widgets : [],
      sortOrder: row.sortOrder,
    };
  }

  // ===== ウィジェット集計 =====

  /** ダッシュボード描画用に各ウィジェットのデータをまとめて算出する。 */
  async computeWidgets(userId: string, role: string, widgets: Widget[]) {
    const visible = await this.permission.visibleAppIds(userId, role); // null=全件
    const userMap = await this.userMap();
    const result: Record<string, any> = {};
    for (const w of widgets || []) {
      try {
        result[w.id] = await this.computeOne(userId, role, w, visible, userMap);
      } catch (e: any) {
        result[w.id] = { type: w.type, error: e?.message || '集計に失敗しました' };
      }
    }
    return result;
  }

  private async userMap(): Promise<Record<string, string>> {
    const users = await this.prisma.user.findMany({ select: { id: true, loginId: true, name: true } });
    const m: Record<string, string> = {};
    for (const u of users) m[u.id] = u.name?.trim() || u.loginId;
    return m;
  }

  private canViewApp(appId: string, visible: string[] | null) {
    return visible === null || visible.includes(appId);
  }

  /**
   * owner/org スコープのアプリで非特権ユーザーはアクセス可能な作成者のレコードだけに絞る。
   * さらに「対象社員フィールド基準」設定があれば、対象社員が自分の部署ツリー内のレコードだけに絞る。
   * （ダッシュボードは各ユーザーが自由に作るため、その人のレコードスコープを尊重する）
   */
  private async scopedRecords(appId: string, userId: string, role: string) {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    const allowed = await this.permission.allowedCreatorIds(appId, userId, role, 'view');
    let records = await this.prisma.record.findMany({
      where: { appId, ...(allowed ? { createdBy: { in: allowed } } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    const fieldScope = await this.permission.recordFieldScope(appId, userId, role);
    if (fieldScope) {
      const allow = new Set(fieldScope.userIds);
      records = records.filter((r) => allow.has(String((r.dataJson as any)?.[fieldScope.field] ?? '')));
    }
    return { app, records };
  }

  private async computeOne(userId: string, role: string, w: Widget, visible: string[] | null, userMap: Record<string, string>) {
    if (w.type === 'mytasks') return this.computeMyTasks(userId, visible, userMap);

    if (!w.appId) return { type: w.type, error: 'アプリが未設定です' };
    if (!this.canViewApp(w.appId, visible)) return { type: w.type, error: 'このアプリの閲覧権限がありません' };

    const { app, records } = await this.scopedRecords(w.appId, userId, role);
    const fields = await this.prisma.field.findMany({ where: { appId: w.appId } });
    const fieldMap: Record<string, FieldLite> = {};
    for (const f of fields) fieldMap[f.fieldCode] = { fieldCode: f.fieldCode, fieldType: f.fieldType, label: f.label, settings: f.settings as any };

    const filtered = records.filter((r) => this.matchFilters((r.dataJson as any) || {}, w.filters || [], fieldMap));

    if (w.type === 'kpi') return this.computeKpi(w, app, filtered, fieldMap);
    if (w.type === 'list') return this.computeList(w, app, filtered, fields, userMap);
    if (w.type === 'map') return this.computeMap(w, app, filtered, fields);
    return this.computeChart(w, app, filtered, fieldMap, userMap);
  }

  // --- 地図（位置情報のピン表示・状況把握ボード/COP用） ---
  private computeMap(w: Widget, app: any, records: any[], fields: any[]) {
    const locFields = fields.filter((f) => f.fieldType === 'location');
    if (locFields.length === 0) return { type: 'map', error: '位置情報の項目があるアプリを選択してください' };
    // 表示する位置項目（groupField で指定、未指定なら先頭の location 項目）。
    const locCode =
      w.groupField && locFields.some((f) => f.fieldCode === w.groupField) ? w.groupField : locFields[0].fieldCode;
    // ピンのラベルに使うタイトル項目（最初の text、無ければ無難な項目）。
    const titleField =
      fields.find((f) => f.fieldType === 'text') ||
      fields.find((f) => !['file', 'subtable', 'section', 'location', 'user_select', 'group_select'].includes(f.fieldType));

    const markers: { id: string; lat: number; lng: number; label: string }[] = [];
    for (const r of records) {
      const data = (r.dataJson as any) || {};
      const loc = data[locCode];
      if (!loc || typeof loc !== 'object' || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;
      const label = (titleField && String(data[titleField.fieldCode] ?? '')) || loc.label || '(無題のレコード)';
      markers.push({ id: r.id, lat: loc.lat, lng: loc.lng, label });
    }

    // 初期表示の中心/ズーム（位置項目の設定があれば利用、無ければフロントが全ピンに合わせる）。
    const settings: any = locFields.find((f) => f.fieldCode === locCode)?.settings || {};
    const center = settings.center && typeof settings.center.lat === 'number' ? settings.center : undefined;
    const zoom = typeof settings.zoom === 'number' ? settings.zoom : undefined;
    return { type: 'map', appId: app.id, appName: app.name, total: records.length, locationField: locCode, markers, center, zoom };
  }

  // --- フィルタ ---
  private matchFilters(data: any, filters: Filter[], fieldMap: Record<string, FieldLite>): boolean {
    for (const f of filters) {
      if (!f?.field) continue;
      const raw = data[f.field];
      const text = this.normalize(raw, fieldMap[f.field]);
      const v = (f.value ?? '').trim();
      const num = Number(text), vnum = Number(v);
      let ok = true;
      switch (f.op) {
        case 'eq': ok = text === v; break;
        case 'ne': ok = text !== v; break;
        case 'contains': ok = text.includes(v); break;
        case 'empty': ok = text === '' || text === '(未設定)'; break;
        case 'notempty': ok = !(text === '' || text === '(未設定)'); break;
        case 'gt': ok = !isNaN(num) && !isNaN(vnum) && num > vnum; break;
        case 'lt': ok = !isNaN(num) && !isNaN(vnum) && num < vnum; break;
        case 'gte': ok = !isNaN(num) && !isNaN(vnum) && num >= vnum; break;
        case 'lte': ok = !isNaN(num) && !isNaN(vnum) && num <= vnum; break;
        default: ok = true;
      }
      if (!ok) return false;
    }
    return true;
  }

  /** 集計キー用に値を文字列化（未入力=(未設定)）。lib/fields.ts groupKey と整合。 */
  private normalize(value: any, _field?: FieldLite): string {
    if (value === null || value === undefined || value === '') return '(未設定)';
    if (Array.isArray(value)) return value.join(', ') || '(未設定)';
    if (typeof value === 'object') {
      if ('lat' in value && 'lng' in value) return String(value.label || `${value.lat}, ${value.lng}`);
      if ('label' in value) return String(value.label || '(未設定)');
      return JSON.stringify(value);
    }
    return String(value);
  }

  // --- 色割当 ---
  /** status/select/radio は選択肢の並び順で色を固定（かんばん/進捗と一致）。 */
  private colorMapFor(field?: FieldLite): Record<string, string> {
    const map: Record<string, string> = { '(未設定)': NEUTRAL_COLOR };
    const opts: string[] = field?.settings?.options || [];
    opts.forEach((o, i) => { map[String(o)] = paletteColor(i); });
    return map;
  }
  private colorForKey(key: string, optionColors: Record<string, string>, fallbackIdx: number): string {
    if (key === '(未設定)') return NEUTRAL_COLOR;
    return optionColors[key] || paletteColor(fallbackIdx);
  }

  // --- プロセス（完了判定） ---
  private processInfo(app: any) {
    const proc: any = app.processConfig || null;
    const hasProcess = !!proc?.enabled && !!proc?.statusField;
    const actions: { from: string }[] = hasProcess ? proc.actions || [] : [];
    const statusField: string | null = hasProcess ? proc.statusField : null;
    const isOpen = (statusVal: any) => (hasProcess ? actions.some((a) => a.from === statusVal) : false);
    return { hasProcess, statusField, isOpen };
  }

  // --- グラフ ---
  private computeChart(w: Widget, app: any, records: any[], fieldMap: Record<string, FieldLite>, userMap: Record<string, string>) {
    const gf = w.groupField;
    if (!gf) return { type: 'chart', chartType: w.chartType || 'bar', data: [], error: '集計項目が未設定です' };
    const field = fieldMap[gf];
    const optionColors = this.colorMapFor(field);
    const metric = w.metric || 'count';
    const isUser = field?.fieldType === 'user_select';

    const groups = new Map<string, { sum: number; count: number; min: number; max: number }>();
    for (const r of records) {
      const data = (r.dataJson as any) || {};
      let key = this.normalize(data[gf], field);
      if (isUser && key !== '(未設定)') key = userMap[key] || key;
      const numVal = w.valueField ? Number(data[w.valueField]) : NaN;
      const g = groups.get(key) || { sum: 0, count: 0, min: Infinity, max: -Infinity };
      g.count += 1;
      if (!isNaN(numVal)) { g.sum += numVal; g.min = Math.min(g.min, numVal); g.max = Math.max(g.max, numVal); }
      groups.set(key, g);
    }

    const data = Array.from(groups.entries()).map(([label, g], i) => {
      let value = g.count;
      if (metric === 'sum') value = g.sum;
      else if (metric === 'avg') value = g.count ? Math.round((g.sum / g.count) * 10) / 10 : 0;
      else if (metric === 'min') value = g.min === Infinity ? 0 : g.min;
      else if (metric === 'max') value = g.max === -Infinity ? 0 : g.max;
      return { label, value, color: this.colorForKey(label, optionColors, i) };
    });

    // 折れ線/エリアは時系列としてラベル昇順、それ以外は値の降順。
    if (w.chartType === 'line' || w.chartType === 'area') data.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
    else data.sort((a, b) => b.value - a.value);

    return {
      type: 'chart',
      chartType: w.chartType || 'bar',
      valueLabel: this.metricLabel(metric, field, fieldMap[w.valueField || '']),
      data,
    };
  }

  private metricLabel(metric: string, groupField?: FieldLite, valueField?: FieldLite): string {
    const by = groupField ? `${groupField.label}別` : '';
    if (metric === 'count') return `${by}件数`;
    const vf = valueField?.label || '値';
    const m = metric === 'sum' ? '合計' : metric === 'avg' ? '平均' : metric === 'min' ? '最小' : '最大';
    return `${by}${vf}の${m}`;
  }

  // --- KPI ---
  private computeKpi(w: Widget, app: any, records: any[], fieldMap: Record<string, FieldLite>) {
    const mode = w.kpiMode || 'count';
    const { hasProcess, statusField, isOpen } = this.processInfo(app);

    if (mode === 'rate' || mode === 'open') {
      if (!hasProcess || !statusField) return { type: 'kpi', error: 'プロセス管理が未設定のアプリです' };
      const total = records.length;
      const open = records.filter((r) => isOpen(((r.dataJson as any) || {})[statusField])).length;
      const done = total - open;
      if (mode === 'open') return { type: 'kpi', value: open, suffix: '件', sub: `全${total}件中`, accent: open > 0 };
      const rate = total ? Math.round((done / total) * 100) : 0;
      return { type: 'kpi', value: rate, suffix: '%', sub: `${done} / ${total} 完了`, gauge: rate };
    }

    if (mode === 'count') return { type: 'kpi', value: records.length, suffix: '件', sub: app.name };

    // sum / avg
    const vf = w.valueField;
    const field = vf ? fieldMap[vf] : undefined;
    if (!vf || !field) return { type: 'kpi', error: '対象の数値項目が未設定です' };
    const nums = records.map((r) => Number(((r.dataJson as any) || {})[vf])).filter((n) => !isNaN(n));
    const sum = nums.reduce((s, n) => s + n, 0);
    const value = mode === 'avg' ? (nums.length ? Math.round((sum / nums.length) * 10) / 10 : 0) : sum;
    const unit = field.settings?.unit || '';
    return { type: 'kpi', value, suffix: unit, sub: `${field.label}の${mode === 'avg' ? '平均' : '合計'}（${nums.length}件）` };
  }

  // --- レコード一覧 ---
  private computeList(w: Widget, app: any, records: any[], fields: any[], userMap: Record<string, string>) {
    const allCodes = fields.map((f) => f.fieldCode);
    let cols = (w.columns && w.columns.length ? w.columns : allCodes).filter((c) => allCodes.includes(c));
    if (cols.length === 0) cols = allCodes.slice(0, 4);
    cols = cols.slice(0, 6);

    const fieldMap: Record<string, any> = {};
    for (const f of fields) fieldMap[f.fieldCode] = f;

    let rows = [...records];
    if (w.sortField && allCodes.includes(w.sortField)) {
      const dir = w.sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const av = ((a.dataJson as any) || {})[w.sortField!];
        const bv = ((b.dataJson as any) || {})[w.sortField!];
        const an = Number(av), bn = Number(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
        return String(av ?? '').localeCompare(String(bv ?? ''), 'ja') * dir;
      });
    }
    const limit = Math.min(Math.max(w.limit || 5, 1), 50);
    rows = rows.slice(0, limit);

    const columns = cols.map((code) => {
      const f = fieldMap[code];
      const colorMap = ['status', 'select', 'radio'].includes(f.fieldType) ? this.colorMapFor({ fieldCode: code, fieldType: f.fieldType, label: f.label, settings: f.settings }) : undefined;
      return { code, label: f.label, fieldType: f.fieldType, colorMap };
    });

    const out = rows.map((r) => {
      const data = (r.dataJson as any) || {};
      const cells: Record<string, string> = {};
      for (const c of cols) cells[c] = this.formatCell(fieldMap[c], data[c], userMap);
      return { id: r.id, cells };
    });

    return { type: 'list', appId: app.id, appName: app.name, total: records.length, columns, rows: out };
  }

  /** 表示用の簡易フォーマッタ（lib/fields.ts formatValue 相当のサーバ版）。 */
  private formatCell(field: any, value: any, userMap: Record<string, string>): string {
    if (value === null || value === undefined || value === '') return '';
    const t = field?.fieldType;
    if (t === 'user_select') return userMap[String(value)] || String(value);
    if (t === 'reference') return value && typeof value === 'object' ? (value.label ?? '') : String(value);
    if (t === 'subtable') return Array.isArray(value) ? `${value.length}件` : '';
    if (t === 'location') {
      if (value && typeof value === 'object' && typeof value.lat === 'number') return value.label || `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`;
      return '';
    }
    if (t === 'checkbox' && Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? '✓' : '';
    if ((t === 'number' || t === 'calc') && !isNaN(Number(value))) {
      let s = String(value);
      if (field.settings?.thousandSeparator) s = Number(value).toLocaleString('ja-JP');
      if (field.settings?.unit) s = `${s} ${field.settings.unit}`;
      return s;
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  // --- 自分のタスク（横断） ---
  private async computeMyTasks(userId: string, visible: string[] | null, _userMap: Record<string, string>) {
    const apps = await this.prisma.app.findMany({
      where: visible === null ? {} : { id: { in: visible.length ? visible : ['__none__'] } },
      orderBy: { updatedAt: 'desc' },
    });
    const tasks: any[] = [];
    for (const app of apps) {
      const { hasProcess, statusField, isOpen } = this.processInfo(app);
      if (!hasProcess || !statusField) continue;
      const fields = await this.prisma.field.findMany({ where: { appId: app.id } });
      const userFields = fields.filter((f) => f.fieldType === 'user_select');
      if (userFields.length === 0) continue;
      const titleField = fields.find((f) => f.fieldType === 'text') || fields.find((f) => !['file', 'user_select', 'group_select', 'subtable', 'section'].includes(f.fieldType));
      const statusOptions: string[] = (fields.find((f) => f.fieldCode === statusField)?.settings as any)?.options || [];
      const colorMap = this.colorMapFor({ fieldCode: statusField, fieldType: 'status', label: '', settings: { options: statusOptions } });
      const records = await this.prisma.record.findMany({ where: { appId: app.id }, orderBy: { updatedAt: 'desc' } });
      for (const r of records) {
        const data = (r.dataJson as any) || {};
        const assigned = userFields.some((f) => String(data[f.fieldCode] ?? '') === userId);
        if (!assigned) continue;
        const statusVal = data[statusField];
        if (!isOpen(statusVal)) continue;
        tasks.push({
          appId: app.id,
          appName: app.name,
          recordId: r.id,
          title: (titleField && String(data[titleField.fieldCode] ?? '')) || '(無題のレコード)',
          status: statusVal ?? null,
          color: statusVal ? this.colorForKey(String(statusVal), colorMap, 0) : NEUTRAL_COLOR,
          updatedAt: r.updatedAt,
        });
      }
    }
    tasks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return { type: 'mytasks', tasks: tasks.slice(0, 12), total: tasks.length };
  }
}
