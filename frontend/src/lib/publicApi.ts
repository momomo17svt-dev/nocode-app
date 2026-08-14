import { translate } from './i18n';

// 匿名公開フォーム用の軽量APIラッパ。
// 通常の api.ts と違い、Authorization ヘッダを付けず、401でも /login へリダイレクトしない
// （未ログインのまま使うことが前提のため）。ベースURLの解決ロジックだけ揃える。
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:3001/api`;

async function handle(res: Response): Promise<any> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join(' / ') : err.message;
    const e = new Error(translate(msg || `APIエラー (${res.status})`));
    (e as any).status = res.status;
    throw e;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const publicApi = {
  get: (endpoint: string) => fetch(`${API_BASE}${endpoint}`, {}).then(handle),

  post: (endpoint: string, data: any) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handle),
};
