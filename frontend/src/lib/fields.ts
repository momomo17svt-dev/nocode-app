// 仕様書 3.6 のフォーム部品14種。
export interface FieldDef {
  id?: string;
  fieldCode: string;
  fieldType: string;
  label: string;
  required: boolean;
  settings: any;
}

export interface FieldTypeMeta {
  type: string;
  label: string;
  /** 選択肢(options)設定を持つか */
  hasOptions?: boolean;
  /** ユーザーが値を入力しない自動系フィールドか */
  auto?: boolean;
}

export const FIELD_TYPES: FieldTypeMeta[] = [
  { type: 'text', label: '文字列1行' },
  { type: 'textarea', label: '複数行テキスト' },
  { type: 'number', label: '数値' },
  { type: 'date', label: '日付' },
  { type: 'datetime', label: '日時' },
  { type: 'checkbox', label: 'チェックボックス', hasOptions: true },
  { type: 'radio', label: 'ラジオボタン', hasOptions: true },
  { type: 'select', label: 'セレクトボックス', hasOptions: true },
  { type: 'user_select', label: 'ユーザー選択' },
  { type: 'group_select', label: 'グループ選択' },
  { type: 'file', label: '添付ファイル' },
  { type: 'auto_number', label: '自動採番', auto: true },
  { type: 'status', label: 'ステータス', hasOptions: true },
  { type: 'calc', label: '計算フィールド', auto: true },
  { type: 'reference', label: '関連レコード参照' },
  { type: 'subtable', label: 'テーブル（明細行）' },
  { type: 'link', label: 'リンク(URL)' },
  { type: 'email', label: 'メール' },
  { type: 'phone', label: '電話番号' },
  { type: 'location', label: '位置（地図）' },
  { type: 'ai', label: 'AI生成', auto: true },
  { type: 'section', label: 'セクション見出し', auto: true },
];

export function fieldTypeLabel(type: string): string {
  return FIELD_TYPES.find((f) => f.type === type)?.label || type;
}

export function fieldTypeMeta(type: string): FieldTypeMeta | undefined {
  return FIELD_TYPES.find((f) => f.type === type);
}

/** レコードのセル値を表示用文字列に整形する。 */
export function formatValue(field: FieldDef, value: any): string {
  if (value === null || value === undefined || value === '') return '';
  // 関連レコード参照は { id, label } 形式。ラベルを表示。
  if (field.fieldType === 'reference') {
    if (value && typeof value === 'object') return value.label ?? '';
    return typeof value === 'string' ? value : '';
  }
  // テーブル（明細行）は行数を表示。
  if (field.fieldType === 'subtable') return Array.isArray(value) ? `${value.length}件` : '';
  // 位置（地図）は { lat, lng, label } 形式。ラベルか緯度経度を表示。
  if (field.fieldType === 'location') {
    if (value && typeof value === 'object' && typeof value.lat === 'number' && typeof value.lng === 'number') {
      return value.label || `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`;
    }
    return '';
  }
  if (field.fieldType === 'checkbox' && Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? '✓' : '';
  // 数値・計算フィールドは桁区切り・単位を反映
  if ((field.fieldType === 'number' || field.fieldType === 'calc') && !isNaN(Number(value))) {
    let s = String(value);
    if (field.settings?.thousandSeparator) s = Number(value).toLocaleString('ja-JP');
    if (field.settings?.unit) s = `${s} ${field.settings.unit}`;
    return s;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** 集計用に値を文字列キーへ正規化（未入力は「(未設定)」）。 */
export function groupKey(value: any): string {
  if (value === null || value === undefined || value === '') return '(未設定)';
  if (Array.isArray(value)) return value.join(', ') || '(未設定)';
  // 位置（地図）{ lat, lng, label }
  if (typeof value === 'object' && 'lat' in value && 'lng' in value) {
    return String(value.label || `${value.lat}, ${value.lng}`);
  }
  // 関連レコード参照 { id, label }
  if (typeof value === 'object' && 'label' in value) return String(value.label || '(未設定)');
  return String(value);
}
