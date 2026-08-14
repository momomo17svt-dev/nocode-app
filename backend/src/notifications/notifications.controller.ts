import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { ReminderService } from './reminder.service';
import { RemindDto } from './dto/remind.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/notifications')
export class NotificationsController {
  constructor(
    private readonly svc: NotificationsService,
    private readonly permission: PermissionService,
    private readonly prisma: PrismaService,
    private readonly reminders: ReminderService,
  ) {}

  /** 期限リマインドを今すぐ実行（システム管理者のみ・運用/検証用）。 */
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  @Post('run-reminders')
  runReminders() {
    return this.reminders.scan();
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.listForUser(user.userId);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { count: await this.svc.unreadCount(user.userId) };
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.svc.markAllRead(user.userId);
  }

  @Post(':id/read')
  read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.markRead(user.userId, id);
  }

  /** 指定ユーザーへ催促通知を送る。アプリ閲覧権限が必要。 */
  @Post('remind')
  async remind(@Body() dto: RemindDto, @CurrentUser() user: AuthUser) {
    await this.permission.assert(user.userId, user.role, dto.appId, 'canView');
    const app = await this.prisma.app.findUnique({ where: { id: dto.appId }, select: { name: true } });
    const sent = await this.svc.notifyMany(dto.userIds, {
      type: 'reminder',
      title: dto.message?.trim() || `「${app?.name ?? 'アプリ'}」の未対応事項の対応をお願いします`,
      appId: dto.appId,
      recordId: dto.recordId,
      actorId: user.userId,
    });
    return { sent };
  }
}
