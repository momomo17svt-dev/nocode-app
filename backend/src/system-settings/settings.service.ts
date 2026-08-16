import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthPolicy {
  maxFailedAttempts: number;
  lockoutMinutes: number;
  attemptWindowMinutes: number;
  sessionHours: number;
  passwordMinLength: number;
}

export interface BackupPolicy {
  enabled: boolean;
  hour: number;
  retentionDays: number;
}

const AUTH_KEY = 'system:auth-policy';
const BACKUP_KEY = 'system:backup-policy';
const AUTH_DEFAULTS: AuthPolicy = {
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  attemptWindowMinutes: 15,
  sessionHours: 8,
  passwordMinLength: 8,
};
const BACKUP_DEFAULTS: BackupPolicy = { enabled: false, hour: 2, retentionDays: 30 };

function int(value: unknown, min: number, max: number, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestException(`${label}は${min}～${max}の整数で指定してください`);
  }
  return n;
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private authCache: AuthPolicy = { ...AUTH_DEFAULTS };

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.getAuthPolicy().catch(() => undefined);
  }

  authPolicyCached(): AuthPolicy {
    return { ...this.authCache };
  }

  async getAuthPolicy(): Promise<AuthPolicy> {
    const row = await this.prisma.setting.findUnique({ where: { key: AUTH_KEY } });
    const raw = (row?.value as Partial<AuthPolicy> | undefined) || {};
    this.authCache = { ...AUTH_DEFAULTS, ...raw };
    return { ...this.authCache };
  }

  async saveAuthPolicy(input: Partial<AuthPolicy>): Promise<AuthPolicy> {
    const policy: AuthPolicy = {
      maxFailedAttempts: int(input.maxFailedAttempts, 3, 20, 'ログイン失敗回数'),
      lockoutMinutes: int(input.lockoutMinutes, 1, 1_440, 'ロック時間'),
      attemptWindowMinutes: int(input.attemptWindowMinutes, 1, 1_440, '失敗回数の集計時間'),
      sessionHours: int(input.sessionHours, 1, 168, 'セッション時間'),
      passwordMinLength: int(input.passwordMinLength, 8, 64, '最低パスワード長'),
    };
    await this.prisma.setting.upsert({
      where: { key: AUTH_KEY },
      update: { value: policy as any },
      create: { key: AUTH_KEY, value: policy as any },
    });
    this.authCache = policy;
    return { ...policy };
  }

  async getBackupPolicy(): Promise<BackupPolicy> {
    const row = await this.prisma.setting.findUnique({ where: { key: BACKUP_KEY } });
    return { ...BACKUP_DEFAULTS, ...((row?.value as Partial<BackupPolicy> | undefined) || {}) };
  }

  async saveBackupPolicy(input: Partial<BackupPolicy>): Promise<BackupPolicy> {
    const policy: BackupPolicy = {
      enabled: !!input.enabled,
      hour: int(input.hour, 0, 23, '実行時刻'),
      retentionDays: int(input.retentionDays, 1, 365, '保存日数'),
    };
    await this.prisma.setting.upsert({
      where: { key: BACKUP_KEY },
      update: { value: policy as any },
      create: { key: BACKUP_KEY, value: policy as any },
    });
    return policy;
  }
}
