/** 条件付きクラス名を結合する小さなユーティリティ。 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
