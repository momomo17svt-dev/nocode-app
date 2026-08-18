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

/** 地図の既定の背景。アプリのフィールド設定が「システム設定に従う」のときに使われる。 */
export interface MapPolicy {
  defaultBasemap: string;
  tileUrl: string;
}

/** フロントの BASEMAPS と対応。内蔵タイル / 単色 / オンライン配信 / カスタムURL。 */
export const BASEMAP_IDS = [
  'pale',
  'std',
  'photo',
  'gray',
  'white',
  'gsi_pale_online',
  'gsi_photo_online',
  'osm_online',
  'custom',
];

const AUTH_KEY = 'system:auth-policy';
const BACKUP_KEY = 'system:backup-policy';
const MAP_KEY = 'system:map-policy';
// 既定は内蔵タイル（オフライン前提）。タイル未取得の環境では、この設定で
// オンライン配信へ切り替えられる。勝手に外部通信を始めないよう既定は変えない。
const MAP_DEFAULTS: MapPolicy = { defaultBasemap: 'pale', tileUrl: '' };
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

  async getMapPolicy(): Promise<MapPolicy> {
    const row = await this.prisma.setting.findUnique({ where: { key: MAP_KEY } });
    const raw = (row?.value as Partial<MapPolicy> | undefined) || {};
    const policy = { ...MAP_DEFAULTS, ...raw };
    // 保存済みの値が未知のIDでも、地図が真っ白にならないよう既定へ戻す。
    if (!BASEMAP_IDS.includes(policy.defaultBasemap)) policy.defaultBasemap = MAP_DEFAULTS.defaultBasemap;
    return policy;
  }

  async saveMapPolicy(input: Partial<MapPolicy>): Promise<MapPolicy> {
    const id = String(input.defaultBasemap || '').trim();
    if (!BASEMAP_IDS.includes(id)) {
      throw new BadRequestException('背景地図の指定が不正です');
    }
    const url = String(input.tileUrl || '').trim();
    // 正規表現で `.*` を並べると入力次第で総当たりになる（CodeQL: js/polynomial-redos）。
    // 判定は前方一致と部分一致だけで足りるので、線形で済む形にしておく。
    const lower = url.toLowerCase();
    const isHttpUrl = lower.startsWith('http://') || lower.startsWith('https://');
    const hasTilePlaceholders = url.includes('{z}') && url.includes('{x}') && url.includes('{y}');
    if (id === 'custom' && !(isHttpUrl && hasTilePlaceholders)) {
      throw new BadRequestException('カスタムタイルURLは http(s) で {z}/{x}/{y} を含む形式にしてください');
    }
    const policy: MapPolicy = { defaultBasemap: id, tileUrl: id === 'custom' ? url.slice(0, 500) : '' };
    await this.prisma.setting.upsert({
      where: { key: MAP_KEY },
      update: { value: policy as any },
      create: { key: MAP_KEY, value: policy as any },
    });
    return policy;
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
