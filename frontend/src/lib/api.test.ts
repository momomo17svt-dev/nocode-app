import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    api.clearCache();
  });

  it('同時に発生した同じGETを1回の通信にまとめる', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      api.get<{ ok: boolean }>('/dedupe'),
      api.get<{ ok: boolean }>('/dedupe'),
    ]);

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('更新通信にCookie資格情報とCSRFヘッダーを付ける', async () => {
    document.cookie = 'nocode_csrf=csrf-token; path=/';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ saved: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/items', { name: 'A' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-token' });
  });

  it('応答しない通信をタイムアウトで中断する', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));

    const pending = api.get('/slow', { cacheMs: 0 });
    const assertion = expect(pending).rejects.toThrow('通信がタイムアウトしました');
    await vi.advanceTimersByTimeAsync(20_001);
    await assertion;
  });

  it('失効時はユーザー情報だけを消し、画面設定を保持する', async () => {
    window.history.replaceState({}, '', '/login');
    localStorage.setItem('user', '{"id":"u1"}');
    localStorage.setItem('theme', 'dark');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    await expect(api.get('/expired')).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
