export type Theme = 'light' | 'dark';

const KEY = 'theme';

/** 保存済みテーマを返す。未設定ならOSの設定を尊重。 */
export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** テーマを適用（<html>に.darkを付与）し保存する。 */
export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(KEY, theme);
}

/** 現在のテーマを反転して適用、適用後の値を返す。 */
export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** アプリ起動時に一度呼び、保存テーマ/OS設定を反映する。 */
export function initTheme() {
  setTheme(getTheme());
}
