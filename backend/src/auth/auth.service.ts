import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';

export type AuthenticatedUser = Omit<User, 'passwordHash'>;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(loginId: string, pass: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersService.findOne(loginId);
    // 無効化ユーザーはログイン不可
    if (user && user.isActive && (await bcrypt.compare(pass, user.passwordHash))) {
      const { passwordHash: _passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginId: string, pass: string) {
    const user = await this.validateUser(loginId, pass);
    if (!user) {
      // 仕様: 「存在しない」「パスワード違い」を区別しない汎用メッセージ
      throw new UnauthorizedException('ログイン情報が正しくありません');
    }
    return {
      access_token: this.issueToken({ userId: user.id, loginId: user.loginId, role: user.role }),
      user,
    };
  }

  issueToken(user: { userId: string; loginId: string; role: string }): string {
    return this.jwtService.sign({ loginId: user.loginId, sub: user.userId, role: user.role });
  }

  /**
   * 本人によるパスワード変更。現在のパスワード確認を必須とする。
   */
  async changePassword(userId: string, loginId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersService.findOne(loginId);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('現在のパスワードが正しくありません');
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('新しいパスワードは8文字以上にしてください');
    }
    await this.usersService.setPassword(userId, newPassword);
    return { success: true };
  }
}
