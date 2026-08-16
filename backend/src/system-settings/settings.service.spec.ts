import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let prisma: any;
  let service: SettingsService;

  beforeEach(() => {
    prisma = { setting: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) } };
    service = new SettingsService(prisma);
  });

  it('未設定時は安全な認証初期値を返す', async () => {
    await expect(service.getAuthPolicy()).resolves.toEqual({
      maxFailedAttempts: 5,
      lockoutMinutes: 15,
      attemptWindowMinutes: 15,
      sessionHours: 8,
      passwordMinLength: 8,
    });
  });

  it('保存した認証ポリシーを即座にキャッシュへ反映する', async () => {
    const policy = { maxFailedAttempts: 4, lockoutMinutes: 20, attemptWindowMinutes: 30, sessionHours: 12, passwordMinLength: 12 };
    await service.saveAuthPolicy(policy);
    expect(service.authPolicyCached()).toEqual(policy);
    expect(prisma.setting.upsert).toHaveBeenCalled();
  });

  it('範囲外の値を拒否する', async () => {
    await expect(service.saveAuthPolicy({ maxFailedAttempts: 1 } as any)).rejects.toThrow(BadRequestException);
  });
});
