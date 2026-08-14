/**
 * ユーザーのローカル設定（お気に入り・最近使ったアプリ）。
 * サーバを使わず localStorage に保持（端末ごと）。
 */
const FAV_KEY = 'fav_apps';
const RECENT_KEY = 'recent_apps';
const RECENT_MAX = 8;

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function write(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* noop */ }
}

export function getFavorites(): string[] {
  return read(FAV_KEY);
}
export function isFavorite(appId: string): boolean {
  return read(FAV_KEY).includes(appId);
}
export function toggleFavorite(appId: string): boolean {
  const list = read(FAV_KEY);
  const i = list.indexOf(appId);
  if (i >= 0) list.splice(i, 1);
  else list.unshift(appId);
  write(FAV_KEY, list);
  return i < 0; // 追加されたら true
}

export function getRecent(): string[] {
  return read(RECENT_KEY);
}
export function pushRecent(appId: string) {
  if (!appId) return;
  const list = read(RECENT_KEY).filter((x) => x !== appId);
  list.unshift(appId);
  write(RECENT_KEY, list.slice(0, RECENT_MAX));
}
export function removeFromPrefs(appId: string) {
  write(FAV_KEY, read(FAV_KEY).filter((x) => x !== appId));
  write(RECENT_KEY, read(RECENT_KEY).filter((x) => x !== appId));
}
