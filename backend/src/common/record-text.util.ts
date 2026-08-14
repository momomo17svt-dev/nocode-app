// レコードの dataJson を人間可読・LLM可読なテキストへ整形する共通ユーティリティ。
// dashboards.service.ts の formatCell と整合する表示ロジック（埋め込み・AI分析で共用）。

export interface FieldLite {
  fieldCode: string;
  fieldType: string;
  label: string;
  settings?: any;
}

/** 1フィールド値を表示用文字列へ。空は '' を返す。 */
export function formatValue(
  field: FieldLite | undefined,
  value: any,
  userMap: Record<string, string> = {},
): string {
  if (value === null || value === undefined || value === '') return '';
  const t = field?.fieldType;
  if (t === 'user_select' || t === 'group_select') {
    if (Array.isArray(value)) return value.map((v) => userMap[String(v)] || String(v)).join(', ');
    return userMap[String(value)] || String(value);
  }
  if (t === 'reference') return value && typeof value === 'object' ? String(value.label ?? '') : String(value);
  if (t === 'subtable') return Array.isArray(value) ? `${value.length}件` : '';
  if (t === 'location') {
    if (value && typeof value === 'object' && typeof value.lat === 'number') {
      return value.label || `${value.lat}, ${value.lng}`;
    }
    return '';
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
  if ((t === 'number' || t === 'calc') && !isNaN(Number(value))) {
    let s = String(value);
    if (field?.settings?.thousandSeparator) s = Number(value).toLocaleString('ja-JP');
    if (field?.settings?.unit) s = `${s} ${field.settings.unit}`;
    return s;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * レコードを「ラベル: 値」の複数行テキストへ。
 * 構造項目(section)とバイナリ(file)は除外。空値の項目はスキップ。
 */
export function recordToText(
  fields: FieldLite[],
  dataJson: Record<string, any>,
  userMap: Record<string, string> = {},
): string {
  const lines: string[] = [];
  for (const f of fields) {
    if (f.fieldType === 'section' || f.fieldType === 'file') continue;
    const v = formatValue(f, dataJson?.[f.fieldCode], userMap);
    if (v === '') continue;
    lines.push(`${f.label}: ${v}`);
  }
  return lines.join('\n');
}
