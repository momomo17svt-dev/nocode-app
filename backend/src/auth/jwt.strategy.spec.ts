import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let prisma: any;
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-and-not-a-placeholder';
    prisma = {
      user: { findUnique: jest.fn() },
      apiToken: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    };
    strategy = new JwtStrategy(prisma);
  });

  it('権限・パスワード変更後の古いセッションを拒否する', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', loginId: 'alice', role: 'Viewer', isActive: true, authVersion: 3 });
    await expect(strategy.validate({ sub: 'u1', loginId: 'alice', role: 'StandardUser', av: 2 })).rejects.toThrow(UnauthorizedException);
  });

  it('DB上の最新ロールを認証結果へ反映する', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', loginId: 'alice', role: 'Viewer', isActive: true, authVersion: 3 });
    await expect(strategy.validate({ sub: 'u1', loginId: 'alice', role: 'SystemAdmin', av: 3 })).resolves.toMatchObject({ role: 'Viewer' });
  });

  it('無効化済みAPIトークンを拒否する', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', loginId: 'alice', role: 'Viewer', isActive: true, authVersion: 0 });
    prisma.apiToken.findUnique.mockResolvedValue({ id: 't1', ownerId: 'u1', revokedAt: new Date(), expiresAt: null });
    await expect(strategy.validate({ kind: 'api', jti: 't1', sub: 'u1', loginId: 'alice', role: 'Viewer', av: 0 })).rejects.toThrow(UnauthorizedException);
  });

  it('APIトークンの読み取り専用属性を認証結果へ渡す', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', loginId: 'alice', role: 'Viewer', isActive: true, authVersion: 0 });
    prisma.apiToken.findUnique.mockResolvedValue({ id: 't1', ownerId: 'u1', readOnly: true, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), lastUsedAt: null });
    await expect(strategy.validate({ kind: 'api', jti: 't1', sub: 'u1', loginId: 'alice', role: 'Viewer', av: 0 })).resolves.toMatchObject({ apiTokenId: 't1', apiTokenReadOnly: true });
  });
});
