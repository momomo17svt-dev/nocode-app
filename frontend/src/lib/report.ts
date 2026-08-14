// 帳票（印刷/PDF）テンプレートの型とユーティリティ。
// 外部ライブラリ非依存・ブラウザ印刷方式（window.print()）でPDF化/印刷する。
import { type FieldDef, formatValue } from './fields';
import { getLocale } from './i18n';

export type PaperSize = 'A4' | 'A5' | 'B5';
export type Orientation = 'portrait' | 'landscape';

/** 帳票ブロック（本文を構成する要素）。 */
export type ReportBlock =
  | { type: 'fields'; columns?: 1 | 2; fieldCodes: string[] }
  | { type: 'subtable'; fieldCode: string }
  | { type: 'text'; content: string }
  | { type: 'heading'; content: string }
  | { type: 'spacer' };

export type ReportBlockType = ReportBlock['type'];

export interface ReportTemplate {
  id: string;
  name: string;
  paper: PaperSize;
  orientation: Orientation;
  /** 文書タイトル（大きく中央表示。例: 請 求 書）。 */
  title: string;
  /** タイトル下の小見出し（{項目コード} 差込可）。 */
  subtitle?: string;
  /** 右上に発行日を表示するか。 */
  showDate?: boolean;
  blocks: ReportBlock[];
  /** ページ下部のフッター（{項目コード} 差込可）。 */
  footer?: string;
}

export interface ReportConfig {
  templates: ReportTemplate[];
}

export const PAPER_LABELS: Record<PaperSize, string> = {
  A4: 'A4',
  A5: 'A5',
  B5: 'B5',
};

/** 用紙サイズ（mm）。[幅, 高さ]（縦向き基準）。 */
export const PAPER_MM: Record<PaperSize, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  B5: [182, 257],
};

/** CSS @page の size 値（例: "A4 portrait"）。 */
export function pageSizeCss(paper: PaperSize, orientation: Orientation): string {
  return `${paper} ${orientation}`;
}

/** 画面プレビュー用の用紙の幅・高さ（mm）。 */
export function sheetSizeMm(paper: PaperSize, orientation: Orientation): { width: number; height: number } {
  const [w, h] = PAPER_MM[paper];
  return orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h };
}

export const BLOCK_LABELS: Record<ReportBlockType, string> = {
  fields: '項目（ラベル＋値）',
  subtable: '明細表（テーブル）',
  text: '自由テキスト',
  heading: '小見出し',
  spacer: '余白',
};

/** 帳票で値を表示できない（または別ブロックで扱う）フィールド種。 */
const NON_FIELD_BLOCK_TYPES = ['file', 'section', 'subtable'];

/** 「項目」ブロックで選択できるフィールド。 */
export function selectableFieldsForBlock(fields: FieldDef[]): FieldDef[] {
  return fields.filter((f) => !NON_FIELD_BLOCK_TYPES.includes(f.fieldType));
}

/** レコードからフィールド種を考慮して既定テンプレートを1つ生成する。 */
export function defaultTemplate(fields: FieldDef[]): ReportTemplate {
  const flat = selectableFieldsForBlock(fields);
  const subtable = fields.find((f) => f.fieldType === 'subtable');
  const blocks: ReportBlock[] = [
    { type: 'fields', columns: 2, fieldCodes: flat.slice(0, 12).map((f) => f.fieldCode) },
  ];
  if (subtable) blocks.push({ type: 'subtable', fieldCode: subtable.fieldCode });
  return {
    id: `rpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: '帳票',
    paper: 'A4',
    orientation: 'portrait',
    title: '帳票',
    showDate: true,
    blocks,
  };
}

/**
 * テキスト中のトークンを実値へ置換する。
 * - `{fieldCode}` … 該当項目の表示値
 * - `{_today}` … 本日の日付
 * - `{_record}` … 全項目を「ラベル: 値」で改行展開
 * resolve は user_select / group_select の名前解決を含む値整形関数。
 */
export function renderTokens(
  text: string | undefined,
  fields: FieldDef[],
  data: Record<string, any>,
  resolve: (f: FieldDef, v: any) => string,
): string {
  if (!text) return '';
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, code) => {
    if (code === '_today') return new Date().toLocaleDateString(getLocale());
    if (code === '_record') {
      return fields
        .filter((f) => !NON_FIELD_BLOCK_TYPES.includes(f.fieldType))
        .map((f) => `${f.label}: ${resolve(f, data[f.fieldCode])}`)
        .join('\n');
    }
    const f = fields.find((x) => x.fieldCode === code);
    if (!f) return '';
    return resolve(f, data[f.fieldCode]) || '';
  });
}

/** 既定の値整形（user/group 解決なし）。print ページ等では解決付き resolve を別途渡す。 */
export function plainResolve(f: FieldDef, v: any): string {
  return formatValue(f, v);
}
