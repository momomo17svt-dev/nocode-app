import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'nocode_session';
export const CSRF_COOKIE = 'nocode_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  // Cookie名は送信側が自由に決められる。素のオブジェクトへ代入すると
  // `__proto__` がプロトタイプ設定に触れるため、nullプロトタイプへ集めてから戻す
  // （スプレッドはセッターを経由しないので、ここでは通常のプロパティとして複写される）。
  const cookies: Record<string, string> = Object.create(null);
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return { ...cookies };
}

export function sessionTokenFromRequest(req: Request): string | null {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

function secureCookies(): boolean {
  return process.env.AUTH_COOKIE_SECURE === 'true';
}

function configuredCookieMaxAge(): number {
  const configured = Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 28_800_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 28_800_000;
}

/** 管理画面で設定したJWT有効期限とブラウザーCookieの期限を一致させる。 */
function tokenMaxAge(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: number };
    if (typeof payload.exp !== 'number') return configuredCookieMaxAge();
    const remaining = payload.exp * 1_000 - Date.now();
    return Math.max(1_000, remaining);
  } catch {
    return configuredCookieMaxAge();
  }
}

export function setAuthCookies(res: Response, token: string): void {
  const common = { path: '/', sameSite: 'lax' as const, secure: secureCookies() };
  const maxAge = tokenMaxAge(token);
  res.cookie(SESSION_COOKIE, token, {
    ...common,
    httpOnly: true,
    maxAge,
  });
  res.cookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), {
    ...common,
    httpOnly: false,
    maxAge,
  });
}

export function clearAuthCookies(res: Response): void {
  const common = { path: '/', sameSite: 'lax' as const, secure: secureCookies() };
  res.clearCookie(SESSION_COOKIE, { ...common, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...common, httpOnly: false });
}

export function csrfTokensMatch(req: Request): boolean {
  const cookieToken = parseCookies(req.headers.cookie)[CSRF_COOKIE];
  const rawHeader = req.headers[CSRF_HEADER];
  const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!cookieToken || !headerToken) return false;
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return cookieBuffer.length === headerBuffer.length && timingSafeEqual(cookieBuffer, headerBuffer);
}
