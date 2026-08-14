import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { csrfTokensMatch, parseCookies, SESSION_COOKIE } from './auth-cookie.util';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfProtectionMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();
    if (
      req.path === '/api/auth/login' ||
      req.path === '/api/auth/session' ||
      req.path.startsWith('/api/public/')
    ) return next();

    const hasSessionCookie = Boolean(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    // API連携向けBearer認証はCookieを使わないため、CSRF検証の対象外。
    if (!hasSessionCookie) return next();
    if (!csrfTokensMatch(req)) {
      throw new ForbiddenException('CSRFトークンが正しくありません。画面を再読み込みしてください');
    }
    next();
  }
}
