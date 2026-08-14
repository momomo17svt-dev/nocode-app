import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let authService: any;
  let audit: any;
  let controller: AuthController;
  const req = { ip: '10.0.0.1' };
  let res: any;

  beforeEach(() => {
    authService = { login: jest.fn(), changePassword: jest.fn(), issueToken: jest.fn().mockReturnValue('fresh-token') };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
    controller = new AuthController(authService, audit);
  });

  describe('createCookieSession', () => {
    it('旧BearerセッションをCookieへ安全に交換する', () => {
      const user = { userId: 'u1', loginId: 'alice', role: 'StandardUser' } as any;
      expect(controller.createCookieSession(user, res)).toEqual({ success: true });
      expect(authService.issueToken).toHaveBeenCalledWith(user);
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('login', () => {
    it('認証して結果を返し、ログインを監査記録する', async () => {
      authService.login.mockResolvedValue({ access_token: 't', user: { id: 'u1' } });
      process.env.AUTH_EXPOSE_BEARER_TOKEN = 'true';
      const result = await controller.login({ loginId: 'a', password: 'p' } as any, req as any, res);
      expect(authService.login).toHaveBeenCalledWith('a', 'p');
      expect(result.access_token).toBe('t');
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'LOGIN', userId: 'u1', ipAddress: '10.0.0.1' }));
    });

    it('通常はBearerトークンを応答本文へ露出しない', async () => {
      delete process.env.AUTH_EXPOSE_BEARER_TOKEN;
      authService.login.mockResolvedValue({ access_token: 'secret', user: { id: 'u1' } });
      const result = await controller.login({ loginId: 'a', password: 'p' } as any, req as any, res);
      expect(result).toEqual({ user: { id: 'u1' } });
    });
  });

  describe('logout', () => {
    it('ログアウトを監査記録する', async () => {
      const result = await controller.logout({ userId: 'u1', loginId: 'a', role: 'StandardUser' } as any, req as any, res);
      expect(result).toEqual({ success: true });
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'LOGOUT', userId: 'u1' }));
    });
  });

  describe('getProfile', () => {
    it('現在のユーザーをそのまま返す', () => {
      const user = { userId: 'u1', loginId: 'a', role: 'StandardUser' } as any;
      expect(controller.getProfile(user)).toBe(user);
    });
  });

  describe('changePassword', () => {
    it('本人のID/loginIdとDTOで委譲し監査記録する', async () => {
      authService.changePassword.mockResolvedValue({ success: true });
      const user = { userId: 'u1', loginId: 'alice', role: 'StandardUser' } as any;
      await controller.changePassword(user, { currentPassword: 'old', newPassword: 'newpassword123' } as any, req);
      expect(authService.changePassword).toHaveBeenCalledWith('u1', 'alice', 'old', 'newpassword123');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'CHANGE_PASSWORD' }));
    });
  });
});
