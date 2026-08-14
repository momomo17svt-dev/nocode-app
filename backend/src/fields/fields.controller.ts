import { Controller, Get, Put, Body, Query, UseGuards, Req } from '@nestjs/common';
import { FieldsService } from './fields.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SaveFieldsDto } from './dto/field.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/fields')
export class FieldsController {
  constructor(
    private readonly fieldsService: FieldsService,
    private readonly permission: PermissionService,
    private readonly audit: AuditLogsService,
  ) {}

  /** フォーム定義の取得。レコード表示にも必要なため閲覧権限で許可。 */
  @Get()
  async findAll(@Query('appId') appId: string, @CurrentUser() user: AuthUser) {
    await this.permission.assert(user.userId, user.role, appId, 'canView');
    return this.fieldsService.findAll(appId);
  }

  /** フォームビルダーの一括保存。アプリ管理権限が必要。 */
  @Put()
  async saveAll(@Body() dto: SaveFieldsDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    await this.permission.assert(user.userId, user.role, dto.appId, 'canManage');
    const result = await this.fieldsService.saveAll(dto.appId, dto.fields);
    await this.audit.log({
      userId: user.userId,
      actionType: 'FORM_DEFINITION_CHANGE',
      targetResource: 'app',
      targetId: dto.appId,
      details: { fieldCount: dto.fields.length },
      ipAddress: req.ip,
    });
    return result;
  }
}
