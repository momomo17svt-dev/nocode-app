import { Injectable, UnauthorizedException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system-settings/settings.service';

export type AuthenticatedUser = Omit<User, 'passwordHash'>;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async validateUser(loginId: string, pass: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersService.findOne(loginId);
    // 存在しないIDでもbcryptを1回実行し、応答時間から存在有無を推測しにくくする。
    const hash = user?.passwordHash || '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const passwordMatches = await bcrypt.compare(pass, hash);
    // 無効化ユーザーはログイン不可
    if (user && user.isActive && passwordMatches) {
      const { passwordHash: _passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginId: string, pass: string, ipAddress = 'unknown') {
    const throttleKey = this.throttleKey(loginId, ipAddress);
    await this.assertNotLocked(throttleKey);
    const user = await this.validateUser(loginId, pass);
    if (!user) {
      await this.recordFailure(throttleKey);
      // 仕様: 「存在しない」「パスワード違い」を区別しない汎用メッセージ
      throw new UnauthorizedException('ログイン情報が正しくありません');
    }
    await this.prisma.loginThrottle.deleteMany({ where: { key: throttleKey } });
    return {
      access_token: this.issueToken({ userId: user.id, loginId: user.loginId, role: user.role, authVersion: user.authVersion }),
      user,
    };
  }

  issueToken(user: { userId: string; loginId: string; role: string; authVersion?: number }): string {
    const sessionHours = this.settings.authPolicyCached().sessionHours;
    return this.jwtService.sign(
      { loginId: user.loginId, sub: user.userId, role: user.role, av: user.authVersion ?? 0 },
      { expiresIn: `${sessionHours}h` },
    );
  }

  passwordPolicy() {
    return { minLength: this.settings.authPolicyCached().passwordMinLength };
  }

  /**
   * 本人によるパスワード変更。現在のパスワード確認を必須とする。
   */
  async changePassword(userId: string, loginId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersService.findOne(loginId);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('現在のパスワードが正しくありません');
    }
    const minLength = this.settings.authPolicyCached().passwordMinLength;
    if (newPassword.length < minLength) {
      throw new BadRequestException(`新しいパスワードは${minLength}文字以上にしてください`);
    }
    await this.usersService.setPassword(userId, newPassword);
    return { success: true };
  }

  private throttleKey(loginId: string, ipAddress: string): string {
    return createHash('sha256').update(`${loginId.trim().toLowerCase()}|${ipAddress}`).digest('hex');
  }

  private async assertNotLocked(key: string): Promise<void> {
    const row = await this.prisma.loginThrottle.findUnique({ where: { key } });
    if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
      throw new HttpException('ログイン試行回数が上限に達しました。時間を置いて再試行してください', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async recordFailure(key: string): Promise<void> {
    const policy = this.settings.authPolicyCached();
    const now = new Date();
    const existing = await this.prisma.loginThrottle.findUnique({ where: { key } });
    const inWindow = !!existing && now.getTime() - existing.firstFailedAt.getTime() <= policy.attemptWindowMinutes * 60_000;
    const attempts = inWindow ? existing!.attempts + 1 : 1;
    const lockedUntil = attempts >= policy.maxFailedAttempts
      ? new Date(now.getTime() + policy.lockoutMinutes * 60_000)
      : null;
    await this.prisma.loginThrottle.upsert({
      where: { key },
      update: { attempts, firstFailedAt: inWindow ? existing!.firstFailedAt : now, lockedUntil },
      create: { key, attempts, firstFailedAt: now, lockedUntil },
    });
    if (lockedUntil) {
      throw new HttpException('ログイン試行回数が上限に達しました。時間を置いて再試行してください', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
