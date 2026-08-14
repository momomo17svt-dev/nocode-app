import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * 監査ログはシステム管理者のみ閲覧可能。記録は各サービスが内部的に行う。
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SystemAdmin')
@Controller('api/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.auditLogsService.findPage(Number(page || 1), Number(pageSize || 50));
  }
}
