// グラフ・かんばん・進捗で共通利用する配色。テーマ非依存の固定パレット。
export const CHART_PALETTE = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#3b82f6',
];

/** 中立色（未設定・補集合など）。 */
export const NEUTRAL_COLOR = '#94a3b8';

export function paletteColor(i: number): string {
  const n = CHART_PALETTE.length;
  return CHART_PALETTE[((i % n) + n) % n];
}

/**
 * ステータス／セレクトの選択肢配列から「選択肢→色」の対応表を作る。
 * 同じアプリ内ではかんばん・進捗・グラフで色が一致する。(未設定) は中立色。
 */
export function buildOptionColors(options: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  options.forEach((o, i) => { map[o] = paletteColor(i); });
  map['(未設定)'] = NEUTRAL_COLOR;
  return map;
}

/**
 * 文字列キーから安定した色を割り当てる（選択肢の並び順が不明な横断表示用）。
 * 同じ文字列は常に同じ色になる。(未設定)/空は中立色。
 */
export function colorForLabel(key: string): string {
  if (!key || key === '(未設定)') return NEUTRAL_COLOR;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return paletteColor(Math.abs(h));
}

/** 不透明色から半透明（軟調背景）を作る。`#rrggbb` 前提。 */
export function softColor(hex: string, alpha = 0.14): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
