import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'nocode_session';
export const CSRF_COOKIE = 'nocode_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
    return cookies;
  }, {});
}

export function sessionTokenFromRequest(req: Request): string | null {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

function secureCookies(): boolean {
  return process.env.AUTH_COOKIE_SECURE === 'true';
}

function cookieMaxAge(): number {
  const configured = Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 28_800_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 28_800_000;
}

export function setAuthCookies(res: Response, token: string): void {
  const common = { path: '/', sameSite: 'lax' as const, secure: secureCookies() };
  res.cookie(SESSION_COOKIE, token, {
    ...common,
    httpOnly: true,
    maxAge: cookieMaxAge(),
  });
  res.cookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), {
    ...common,
    httpOnly: false,
    maxAge: cookieMaxAge(),
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
