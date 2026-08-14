import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let authService: any;
  let audit: any;
  let controller: AuthController;
  const req = { ip: '10.0.0.1' };

  beforeEach(() => {
    authService = { login: jest.fn(), changePassword: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new AuthController(authService, audit);
  });

  describe('login', () => {
    it('認証して結果を返し、ログインを監査記録する', async () => {
      authService.login.mockResolvedValue({ access_token: 't', user: { id: 'u1' } });
      const res = await controller.login({ loginId: 'a', password: 'p' } as any, req);
      expect(authService.login).toHaveBeenCalledWith('a', 'p');
      expect(res.access_token).toBe('t');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'LOGIN', userId: 'u1', ipAddress: '10.0.0.1' }));
    });
  });

  describe('logout', () => {
    it('ログアウトを監査記録する', async () => {
      const res = await controller.logout({ userId: 'u1', loginId: 'a', role: 'StandardUser' } as any, req);
      expect(res).toEqual({ success: true });
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
