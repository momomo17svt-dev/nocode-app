import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let users: any;
  let jwt: any;
  let prisma: any;
  let settings: any;
  let service: AuthService;
  const mockedCompare = bcrypt.compare as jest.Mock;

  beforeEach(() => {
    users = { findOne: jest.fn(), setPassword: jest.fn().mockResolvedValue(undefined) };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    prisma = {
      loginThrottle: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    settings = { authPolicyCached: jest.fn().mockReturnValue({ maxFailedAttempts: 5, lockoutMinutes: 15, attemptWindowMinutes: 15, sessionHours: 8, passwordMinLength: 8 }) };
    service = new AuthService(users, jwt, prisma, settings);
    jest.clearAllMocks();
  });

  const activeUser = {
    id: 'u1',
    loginId: 'alice',
    role: 'StandardUser',
    isActive: true,
    passwordHash: 'hashed',
    authVersion: 0,
  };

  describe('validateUser', () => {
    it('正しい資格情報ならパスワードハッシュを除いたユーザーを返す', async () => {
      users.findOne.mockResolvedValue(activeUser);
      mockedCompare.mockResolvedValue(true);

      const result = await service.validateUser('alice', 'correct-pass');

      expect(result).toEqual({ id: 'u1', loginId: 'alice', role: 'StandardUser', isActive: true, authVersion: 0 });
      expect(result.passwordHash).toBeUndefined();
    });

    it('パスワード不一致なら null', async () => {
      users.findOne.mockResolvedValue(activeUser);
      mockedCompare.mockResolvedValue(false);
      expect(await service.validateUser('alice', 'wrong')).toBeNull();
    });

    it('存在しないユーザーは null', async () => {
      users.findOne.mockResolvedValue(null);
      expect(await service.validateUser('ghost', 'x')).toBeNull();
    });

    it('無効化ユーザーはログイン不可（null）', async () => {
      users.findOne.mockResolvedValue({ ...activeUser, isActive: false });
      mockedCompare.mockResolvedValue(true);
      expect(await service.validateUser('alice', 'correct-pass')).toBeNull();
    });
  });

  describe('login', () => {
    it('成功時はアクセストークンとユーザーを返す', async () => {
      users.findOne.mockResolvedValue(activeUser);
      mockedCompare.mockResolvedValue(true);

      const result = await service.login('alice', 'correct-pass');

      expect(result.access_token).toBe('signed.jwt.token');
      expect(jwt.sign).toHaveBeenCalledWith(
        { loginId: 'alice', sub: 'u1', role: 'StandardUser', av: 0 },
        { expiresIn: '8h' },
      );
      expect(result.user.passwordHash).toBeUndefined();
    });

    it('失敗時は汎用メッセージで Unauthorized（存在/パスワードを区別しない）', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.login('ghost', 'x')).rejects.toThrow(UnauthorizedException);
    });

    it('設定回数に達するとログインを一時ロックする', async () => {
      settings.authPolicyCached.mockReturnValue({ maxFailedAttempts: 3, lockoutMinutes: 10, attemptWindowMinutes: 15, sessionHours: 8, passwordMinLength: 8 });
      users.findOne.mockResolvedValue(null);
      prisma.loginThrottle.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ attempts: 2, firstFailedAt: new Date(), lockedUntil: null });
      await expect(service.login('ghost', 'x')).rejects.toMatchObject({ status: 429 });
      expect(prisma.loginThrottle.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ attempts: 3, lockedUntil: expect.any(Date) }),
      }));
    });
  });

  describe('changePassword', () => {
    it('現在のパスワードが正しく新パスワードが8文字以上なら更新', async () => {
      users.findOne.mockResolvedValue(activeUser);
      mockedCompare.mockResolvedValue(true);

      const result = await service.changePassword('u1', 'alice', 'current', 'newpassword123');

      expect(result).toEqual({ success: true });
      expect(users.setPassword).toHaveBeenCalledWith('u1', 'newpassword123');
    });

    it('現在のパスワードが違えば BadRequest', async () => {
      users.findOne.mockResolvedValue(activeUser);
      mockedCompare.mockResolvedValue(false);
      await expect(service.changePassword('u1', 'alice', 'wrong', 'newpassword123')).rejects.toThrow(BadRequestException);
      expect(users.setPassword).not.toHaveBeenCalled();
    });

    it('新パスワードが8文字未満なら BadRequest', async () => {
      users.findOne.mockResolvedValue(activeUser);
      mockedCompare.mockResolvedValue(true);
      await expect(service.changePassword('u1', 'alice', 'current', 'short')).rejects.toThrow(BadRequestException);
      expect(users.setPassword).not.toHaveBeenCalled();
    });
  });
});
