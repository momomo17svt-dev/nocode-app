import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateLegacySession } from './auth';

describe('migrateLegacySession', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('旧JWTをCookieセッションへ交換してlocalStorageから削除する', async () => {
    localStorage.setItem('token', 'legacy-token');
    localStorage.setItem('user', '{"id":"u1"}');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await migrateLegacySession('/api');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: 'Bearer legacy-token' },
    }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).not.toBeNull();
  });
});
