import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { DirectoryQueryDto } from './dto/directory-query.dto';

/** 全社員を閲覧できる特権ロール（scope=mygroups を無視して全件対象）。 */
const PRIVILEGED_ROLES = ['SystemAdmin'];

/**
 * 公開範囲(指定ユーザー/グループ)の選択用に、最小限の一覧を認証ユーザーへ提供する。
 * パスワード等の機微情報は返さない。
 *
 * モード（後方互換）:
 *   - パラメータ無し → 全件（既存のラベル解決画面が依存）
 *   - q=...        → 部分一致検索（既定20件・最大100件）
 *   - ids=a,b,c    → 指定IDの解決（選択済みの表示名復元用）
 *   - scope=mygroups → ユーザー検索を「自分の所属部署＋配下部署のメンバー」に限定（特権ロールは全件）
 */
@UseGuards(JwtAuthGuard)
@Controller('api/directory')
export class DirectoryController {
  constructor(
    private prisma: PrismaService,
    private permission: PermissionService,
  ) {}

  /** 自分の所属部署＋配下部署のメンバーから loginId 部分一致で検索する。 */
  private async myGroupMembers(userId: string, q: string, take: number) {
    const groupIds = await this.permission.myScopeGroupIds(userId);
    if (groupIds.length === 0) return [];
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { loginId: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
        groupId: { in: groupIds },
      },
      select: { id: true, loginId: true, name: true },
      orderBy: { loginId: 'asc' },
      take,
    });
  }

  private parseIds(ids?: string): string[] {
    if (!ids) return [];
    return Array.from(
      new Set(
        ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ).slice(0, 1000);
  }

  @Get('users')
  users(@Query() query: DirectoryQueryDto, @CurrentUser() user: AuthUser) {
    const ids = this.parseIds(query.ids);
    if (ids.length) {
      // ID解決: 選択済みの表示名復元。スコープ外でも復元できるよう isActive で絞らない。
      return this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, loginId: true, name: true },
        orderBy: { loginId: 'asc' },
      });
    }
    const q = (query.q ?? '').trim();
    // 所属部署ツリー限定スコープ（特権ロールは無視して全件対象）。
    if (query.scope === 'mygroups' && !PRIVILEGED_ROLES.includes(user.role)) {
      return this.myGroupMembers(user.userId, q, Math.min(100, query.take ?? 20));
    }
    if (q) {
      return this.prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { loginId: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, loginId: true, name: true },
        orderBy: { loginId: 'asc' },
        take: Math.min(100, query.take ?? 20),
      });
    }
    // 後方互換: 全件（既存画面のラベル解決用）。
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, loginId: true, name: true },
      orderBy: { loginId: 'asc' },
    });
  }

  @Get('groups')
  groups(@Query() query: DirectoryQueryDto) {
    const ids = this.parseIds(query.ids);
    if (ids.length) {
      return this.prisma.group.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    }
    const q = (query.q ?? '').trim();
    if (q) {
      return this.prisma.group.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: Math.min(100, query.take ?? 20),
      });
    }
    // 後方互換: 全件。
    return this.prisma.group.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
