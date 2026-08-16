import { translate } from './i18n';

// バックエンドのベースURL。Dockerでは同一オリジンの /api、bat/devでは画面のホスト:3001 を使う。
const configuredBase = import.meta.env.VITE_API_BASE?.trim();
const API_BASE = configuredBase ||
  (import.meta.env.PROD ? '/api' : `${window.location.protocol}//${window.location.hostname}:3001/api`);

const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS || 20_000);
const API_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 20_000;
const GET_CACHE_MS = 2_000;

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(
    message: string,
    status: number,
    body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type CacheEntry = { expiresAt: number; value: unknown };
const getCache = new Map<string, CacheEntry>();
const inFlightGets = new Map<string, Promise<unknown>>();

export function csrfHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('nocode_csrf='))
    ?.slice('nocode_csrf='.length);
  return token ? { ...extra, 'X-CSRF-Token': decodeURIComponent(token) } : { ...extra };
}

function clearSession(): void {
  // テーマや画面設定は残し、認証情報だけを破棄する。
  localStorage.removeItem('user');
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    throw new ApiError(translate('認証の有効期限が切れました。再度ログインしてください。'), 401, null);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(' / ') : body.message;
    throw new ApiError(translate(message || `APIエラー (${res.status})`), res.status, body);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function request<T>(endpoint: string, init: RequestInit = {}, timeoutMs = API_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
    });
    return await parseResponse<T>(res);
  } catch (error) {
    if (timedOut) throw new Error(translate('通信がタイムアウトしました。しばらくしてから再試行してください。'), { cause: error });
    throw error;
  } finally {
    window.clearTimeout(timer);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

function invalidateGetCache(): void {
  getCache.clear();
}

export const api = {
  base: API_BASE,

  get<T = any>(endpoint: string, options: { cacheMs?: number; signal?: AbortSignal } = {}): Promise<T> {
    const cacheMs = options.cacheMs ?? GET_CACHE_MS;
    const cached = getCache.get(endpoint);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T);
    const existing = inFlightGets.get(endpoint);
    if (existing) return existing as Promise<T>;

    const pending = request<T>(endpoint, { signal: options.signal })
      .then((value) => {
        if (cacheMs > 0) getCache.set(endpoint, { value, expiresAt: Date.now() + cacheMs });
        return value;
      })
      .finally(() => inFlightGets.delete(endpoint));
    inFlightGets.set(endpoint, pending);
    return pending;
  },

  async post<T = any, TBody = unknown>(endpoint: string, data: TBody): Promise<T> {
    invalidateGetCache();
    return request<T>(endpoint, {
      method: 'POST',
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
  },

  async put<T = any, TBody = unknown>(endpoint: string, data: TBody): Promise<T> {
    invalidateGetCache();
    return request<T>(endpoint, {
      method: 'PUT',
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
  },

  async delete<T = any>(endpoint: string): Promise<T> {
    invalidateGetCache();
    return request<T>(endpoint, { method: 'DELETE', headers: csrfHeaders() });
  },

  /** multipart/form-data 送信（添付ファイルアップロード用）。 */
  async upload<T = any>(endpoint: string, formData: FormData): Promise<T> {
    invalidateGetCache();
    return request<T>(endpoint, { method: 'POST', headers: csrfHeaders(), body: formData });
  },

  /** バイナリ取得（CSV・添付ファイル等）。 */
  async getBlob(endpoint: string): Promise<Blob> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.status === 401) {
        clearSession();
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
      }
      if (!res.ok) throw new Error(translate(`ダウンロードに失敗しました (${res.status})`));
      return res.blob();
    } catch (error) {
      if (controller.signal.aborted) throw new Error(translate('ダウンロードがタイムアウトしました'), { cause: error });
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  },

  /** キャッシュを明示破棄（ログアウトや外部更新後に使用）。 */
  clearCache: invalidateGetCache,

  attachmentUrl: (id: string) => `${API_BASE}/attachments/${id}/download`,
};
