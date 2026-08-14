// ダッシュボードのウィジェット定義（フロント・バックエンドで共有する形）。
import { MAP_HEIGHT_CLASS, MAP_HEIGHT_LABELS, mapHeightClass, type MapHeight } from './map';
// 地図の高さスケールは lib/map.ts を単一の出所とし、ここからも再公開する。
export { MAP_HEIGHT_CLASS, MAP_HEIGHT_LABELS, mapHeightClass, type MapHeight };

export type WidgetType = 'chart' | 'kpi' | 'list' | 'mytasks' | 'map';
export type WidgetSize = 'sm' | 'md' | 'lg' | 'full';
export type ChartKind = 'bar' | 'pie' | 'donut' | 'line' | 'area';
export type Metric = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type KpiMode = 'count' | 'sum' | 'avg' | 'open' | 'rate';

export interface WidgetFilter {
  field: string;
  op: string;
  value?: string;
}

export interface Widget {
  id: string;
  type: WidgetType;
  title?: string;
  size?: WidgetSize;
  appId?: string;
  chartType?: ChartKind;
  groupField?: string;
  metric?: Metric;
  valueField?: string;
  kpiMode?: KpiMode;
  columns?: string[];
  limit?: number;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  filters?: WidgetFilter[];
  /** ウィジェットの高さ（全タイプ共通。未指定＝自動＝コンテンツ依存）。 */
  height?: MapHeight;
  /** @deprecated 旧・地図専用の高さ。保存済みデータの後方互換のためだけに残す。読み取りは widgetHeight() を使う。 */
  mapHeight?: MapHeight;
}

/** ウィジェットの高さ（旧 mapHeight も読む。未指定＝自動）。 */
export function widgetHeight(w: Widget): MapHeight | undefined {
  return w.height ?? w.mapHeight;
}

export type AccessMode = 'private' | 'shared' | 'public';
export interface ShareEntry {
  targetType: 'User' | 'Group';
  targetId: string;
  canEdit: boolean;
}
export interface AccessConfig {
  mode: AccessMode;
  shares: ShareEntry[];
}

export interface DashboardDef {
  id: string;
  name: string;
  isShared: boolean;
  access: AccessConfig;
  ownerId: string;
  isOwner: boolean;
  /** 名前/共有設定/削除が可能か（所有者・システム管理者）。 */
  canManage: boolean;
  /** ウィジェットの追加・編集が可能か（所有者・管理者・共有編集者）。 */
  canEdit: boolean;
  widgets: Widget[];
  sortOrder: number;
}

export const ACCESS_MODE_LABELS: Record<AccessMode, string> = {
  private: '自分のみ',
  shared: '指定して共有',
  public: '全員に公開',
};

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  chart: 'グラフ',
  kpi: 'KPI数値',
  list: 'レコード一覧',
  mytasks: '自分のタスク',
  map: '地図',
};

export const CHART_KIND_LABELS: Record<ChartKind, string> = {
  bar: '棒グラフ',
  pie: '円グラフ',
  donut: 'ドーナツ',
  line: '折れ線',
  area: 'エリア',
};

export const METRIC_LABELS: Record<Metric, string> = {
  count: '件数',
  sum: '合計',
  avg: '平均',
  min: '最小',
  max: '最大',
};

export const KPI_MODE_LABELS: Record<KpiMode, string> = {
  count: 'レコード件数',
  sum: '数値の合計',
  avg: '数値の平均',
  open: '未完了件数',
  rate: '完了率',
};

export const SIZE_LABELS: Record<WidgetSize, string> = {
  sm: '小',
  md: '中',
  lg: '大',
  full: '全幅',
};

export const FILTER_OPS: { op: string; label: string }[] = [
  { op: 'eq', label: '＝' },
  { op: 'ne', label: '≠' },
  { op: 'contains', label: '含む' },
  { op: 'gt', label: '＞' },
  { op: 'lt', label: '＜' },
  { op: 'gte', label: '≧' },
  { op: 'lte', label: '≦' },
  { op: 'empty', label: '空' },
  { op: 'notempty', label: '空でない' },
];

/** グリッド列のスパン（リテラルでTailwindに検出させる）。 */
const SPAN: Record<WidgetSize, string> = {
  sm: 'sm:col-span-1 lg:col-span-1',
  md: 'sm:col-span-2 lg:col-span-2',
  lg: 'sm:col-span-2 lg:col-span-3',
  full: 'sm:col-span-2 lg:col-span-4',
};
export function sizeSpan(size?: WidgetSize): string {
  return SPAN[size || 'md'];
}

/** 集計に使える項目か（添付・明細・見出し・位置は除く）。 */
export function isGroupable(fieldType: string): boolean {
  return !['file', 'subtable', 'section', 'location', 'group_select'].includes(fieldType);
}
/** 数値集計の対象になる項目か。 */
export function isNumeric(fieldType: string): boolean {
  return fieldType === 'number' || fieldType === 'calc';
}

let seq = 0;
export function newWidgetId(): string {
  seq += 1;
  return `w_${Date.now().toString(36)}_${seq}`;
}

export function defaultWidget(type: WidgetType): Widget {
  const base: Widget = { id: newWidgetId(), type };
  if (type === 'chart') return { ...base, size: 'lg', chartType: 'bar', metric: 'count' };
  if (type === 'kpi') return { ...base, size: 'sm', kpiMode: 'count' };
  if (type === 'list') return { ...base, size: 'md', limit: 5 };
  if (type === 'map') return { ...base, size: 'lg', height: 'md' };
  return { ...base, size: 'md' }; // mytasks
}
