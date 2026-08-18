import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../system-settings/settings.service';

/** 匿名投稿用のセンチネル。管理者判定の対象外。 */
const ANON_USER_ID = 'anonymous';

/**
 * 初回セットアップ（管理者がまだ1人もいない状態）を扱う。
 * 環境変数へ初期パスワードを書かせる代わりに、最初のアクセスで画面から管理者を作る。
 */
@Injectable()
export class SetupService {
  constructor(
    private prisma: PrismaService,
    private users: UsersService,
    private settings: SettingsService,
  ) {}

  async status(): Promise<{ required: boolean; passwordMinLength: number }> {
    return {
      required: await this.isRequired(),
      passwordMinLength: this.settings.authPolicyCached().passwordMinLength,
    };
  }

  /**
   * 最初のシステム管理者を作成する。管理者が既にいる場合は誰も作れない。
   * 作成後はこのエンドポイント自体が閉じるため、ユーザー追加は管理画面から行う。
   */
  async createFirstAdmin(input: { loginId: string; name?: string; password: string }) {
    if (!(await this.isRequired())) {
      throw new ForbiddenException('管理者は既に作成済みです。ログイン画面からサインインしてください');
    }
    return this.users.create({
      loginId: input.loginId.trim(),
      name: input.name?.trim() || undefined,
      password: input.password,
      role: 'SystemAdmin',
    });
  }

  private async isRequired(): Promise<boolean> {
    const admins = await this.prisma.user.count({
      where: { role: 'SystemAdmin', id: { not: ANON_USER_ID } },
    });
    return admins === 0;
  }
}
