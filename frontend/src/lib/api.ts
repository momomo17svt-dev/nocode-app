// バックエンドのベースURL。
// 既定では「画面を開いているホスト名: 3001」を使うため、LAN内の別PCからでも到達できる。
// VITE_API_BASE で明示指定も可能。
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:3001/api`;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

async function handle(res: Response): Promise<any> {
  if (res.status === 401) {
    // 認証切れ: トークンを破棄してログインへ
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new Error('認証の有効期限が切れました。再度ログインしてください。');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join(' / ') : err.message;
    const e: any = new Error(msg || `APIエラー (${res.status})`);
    e.status = res.status;
    e.body = err;
    throw e;
  }
  // 204等の空応答に対応
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  base: API_BASE,

  get: (endpoint: string) =>
    fetch(`${API_BASE}${endpoint}`, { headers: authHeaders() }).then(handle),

  post: (endpoint: string, data: any) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    }).then(handle),

  put: (endpoint: string, data: any) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    }).then(handle),

  delete: (endpoint: string) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then(handle),

  /** multipart/form-data 送信（添付ファイルアップロード用）。 */
  upload: (endpoint: string, formData: FormData) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    }).then(handle),

  /** バイナリ取得（CSVダウンロード等）。 */
  async getBlob(endpoint: string): Promise<Blob> {
    const res = await fetch(`${API_BASE}${endpoint}`, { headers: authHeaders() });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.clear();
        location.href = '/login';
      }
      throw new Error(`ダウンロードに失敗しました (${res.status})`);
    }
    return res.blob();
  },

  /** 添付ファイルのダウンロードURL（トークンはクエリ送付できないためfetch経由で取得）。 */
  attachmentUrl: (id: string) => `${API_BASE}/attachments/${id}/download`,
};
