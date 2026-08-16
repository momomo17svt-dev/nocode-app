import type { Request } from 'express';
import { csrfTokensMatch, parseCookies, sessionTokenFromRequest } from './auth-cookie.util';

describe('auth-cookie utilities', () => {
  it('Cookieヘッダーを安全に解析する', () => {
    // 本アプリのCookieだけを取り出し、無関係なCookieは無視する
    expect(parseCookies('nocode_session=jwt; nocode_csrf=hello%20world; other=x')).toEqual({
      nocode_session: 'jwt',
      nocode_csrf: 'hello world',
    });
  });

  it('セッションCookieからJWTを取り出す', () => {
    const req = { headers: { cookie: 'nocode_session=jwt-token' } } as Request;
    expect(sessionTokenFromRequest(req)).toBe('jwt-token');
  });

  it('CookieとヘッダーのCSRFトークンを定数時間で照合する', () => {
    const req = {
      headers: { cookie: 'nocode_csrf=abc123', 'x-csrf-token': 'abc123' },
    } as unknown as Request;
    expect(csrfTokensMatch(req)).toBe(true);
  });
});
