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

  describe('地図の既定背景', () => {
    it('未設定時は内蔵タイル（淡色）を返す', async () => {
      await expect(service.getMapPolicy()).resolves.toEqual({ defaultBasemap: 'pale', tileUrl: '' });
    });

    it('未知のIDが保存されていても既定へ戻す', async () => {
      prisma.setting.findUnique.mockResolvedValue({ value: { defaultBasemap: 'unknown_style', tileUrl: '' } });
      await expect(service.getMapPolicy()).resolves.toEqual({ defaultBasemap: 'pale', tileUrl: '' });
    });

    it('オンライン地図を既定にできる', async () => {
      await expect(service.saveMapPolicy({ defaultBasemap: 'osm_online' })).resolves.toEqual({
        defaultBasemap: 'osm_online',
        tileUrl: '',
      });
      expect(prisma.setting.upsert).toHaveBeenCalled();
    });

    it('カスタムは {z}/{x}/{y} を含むURLを必須にする', async () => {
      await expect(service.saveMapPolicy({ defaultBasemap: 'custom', tileUrl: 'https://example.test/tiles' }))
        .rejects.toThrow(BadRequestException);
      await expect(
        service.saveMapPolicy({ defaultBasemap: 'custom', tileUrl: 'https://example.test/{z}/{x}/{y}.png' }),
      ).resolves.toEqual({ defaultBasemap: 'custom', tileUrl: 'https://example.test/{z}/{x}/{y}.png' });
    });

    it('不正なIDを拒否する', async () => {
      await expect(service.saveMapPolicy({ defaultBasemap: 'evil' })).rejects.toThrow(BadRequestException);
    });

    it('カスタム以外ではURLを保存しない', async () => {
      await expect(service.saveMapPolicy({ defaultBasemap: 'pale', tileUrl: 'https://example.test/{z}/{x}/{y}.png' }))
        .resolves.toEqual({ defaultBasemap: 'pale', tileUrl: '' });
    });
  });
});
