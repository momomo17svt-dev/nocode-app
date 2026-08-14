/** 匿名公開フォーム投稿の作成者として使うセンチネルユーザーID（seedで作成）。 */
export const ANONYMOUS_USER_ID = 'anonymous';

/**
 * 匿名公開フォームで「表示してよい」フィールド種。
 * user_select / group_select / reference / file / ai は認証や内部APIに依存するため除外する。
 */
export const PUBLIC_SAFE_FIELD_TYPES = new Set<string>([
  'text', 'textarea', 'number', 'date', 'datetime',
  'checkbox', 'radio', 'select', 'status',
  'email', 'phone', 'link', 'location', 'subtable', 'section',
  'auto_number', 'calc',
]);

/**
 * 匿名投稿で「値を受け付けてよい」フィールド種（= 安全な種から自動系を除いたもの）。
 * auto_number / calc はサーバが計算、section は見出しで値を持たない。
 */
export const PUBLIC_INPUT_FIELD_TYPES = new Set<string>(
  [...PUBLIC_SAFE_FIELD_TYPES].filter((t) => !['auto_number', 'calc', 'section'].includes(t)),
);
