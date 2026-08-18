import { ForbiddenException } from '@nestjs/common';
import { SetupService } from './setup.service';

describe('SetupService', () => {
  let prisma: any;
  let users: any;
  let settings: any;
  let service: SetupService;

  beforeEach(() => {
    prisma = { user: { count: jest.fn().mockResolvedValue(0) } };
    users = { create: jest.fn().mockResolvedValue({ id: 'u1', loginId: 'admin', role: 'SystemAdmin' }) };
    settings = { authPolicyCached: jest.fn().mockReturnValue({ passwordMinLength: 8 }) };
    service = new SetupService(prisma, users, settings);
    jest.clearAllMocks();
  });

  it('管理者が1人もいなければセットアップが必要', async () => {
    prisma.user.count.mockResolvedValue(0);
    await expect(service.status()).resolves.toEqual({ required: true, passwordMinLength: 8 });
  });

  it('管理者がいればセットアップは不要', async () => {
    prisma.user.count.mockResolvedValue(1);
    await expect(service.status()).resolves.toEqual({ required: false, passwordMinLength: 8 });
  });

  it('匿名センチネルは管理者として数えない', async () => {
    await service.status();
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: 'SystemAdmin', id: { not: 'anonymous' } },
    });
  });

  it('最初の管理者をSystemAdminとして作る', async () => {
    await service.createFirstAdmin({ loginId: ' admin ', name: ' 管理者 ', password: 'strong-password' });
    expect(users.create).toHaveBeenCalledWith({
      loginId: 'admin',
      name: '管理者',
      password: 'strong-password',
      role: 'SystemAdmin',
    });
  });

  it('管理者が既にいる場合は作成を拒否する', async () => {
    prisma.user.count.mockResolvedValue(1);
    await expect(
      service.createFirstAdmin({ loginId: 'admin2', password: 'strong-password' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.create).not.toHaveBeenCalled();
  });
});
