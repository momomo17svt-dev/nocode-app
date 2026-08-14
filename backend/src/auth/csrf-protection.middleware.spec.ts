import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CsrfProtectionMiddleware } from './csrf-protection.middleware';

describe('CsrfProtectionMiddleware', () => {
  const middleware = new CsrfProtectionMiddleware();
  const res = {} as Response;

  function request(method: string, path: string, cookie?: string, token?: string): Request {
    return {
      method,
      path,
      headers: { cookie, ...(token ? { 'x-csrf-token': token } : {}) },
    } as unknown as Request;
  }

  it('Cookie認証の更新リクエストで一致するトークンを必須にする', () => {
    const next = jest.fn() as NextFunction;
    middleware.use(request('POST', '/api/apps', 'nocode_session=jwt; nocode_csrf=token', 'token'), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('不一致なら拒否する', () => {
    expect(() => middleware.use(
      request('DELETE', '/api/apps/a', 'nocode_session=jwt; nocode_csrf=token', 'other'),
      res,
      jest.fn(),
    )).toThrow(ForbiddenException);
  });

  it('GET・ログイン・Bearer専用リクエストは通す', () => {
    for (const req of [
      request('GET', '/api/apps', 'nocode_session=jwt'),
      request('POST', '/api/auth/login', 'nocode_session=old'),
      request('POST', '/api/auth/session', 'nocode_session=old'),
      request('POST', '/api/apps'),
    ]) {
      const next = jest.fn();
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  });
});
