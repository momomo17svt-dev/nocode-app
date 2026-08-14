import { Controller, Get, Post, Body, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AppPermissionsService } from './app-permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SetPermissionsDto } from './dto/app-permission.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/app-permissions')
export class AppPermissionsController {
  constructor(
    private readonly appPermissionsService: AppPermissionsService,
    private readonly permission: PermissionService,
    private readonly audit: AuditLogsService,
  ) {}

  @Get()
  async findAll(@Query('appId') appId: string, @CurrentUser() user: AuthUser) {
    await this.permission.assert(user.userId, user.role, appId, 'canManage');
    return this.appPermissionsService.findAll(appId);
  }

  @Post()
  async setPermissions(
    @Body() body: SetPermissionsDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    await this.permission.assert(user.userId, user.role, body.appId, 'canManage');
    // 管理者(GroupAdmin)は、管轄内のユーザー/グループにしか権限を付与できない（全公開も不可）。
    if (user.role === 'GroupAdmin') {
      for (const p of body.permissions) {
        if (p.targetType === 'All') {
          throw new ForbiddenException('管理者は「全ユーザー公開」を設定できません');
        }
        if (p.targetType === 'User' && p.targetId) {
          await this.permission.assertUserInScope(user.userId, user.role, p.targetId);
        } else if (p.targetType === 'Group' && p.targetId) {
          await this.permission.assertGroupInScope(user.userId, user.role, p.targetId);
        }
      }
    }
    const result = await this.appPermissionsService.setPermissions(body.appId, body.permissions);
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_PERMISSION_CHANGE',
      targetResource: 'app',
      targetId: body.appId,
      details: { count: body.permissions.length },
      ipAddress: req.ip,
    });
    return result;
  }
}
