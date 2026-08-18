import { Body, Controller, Delete, Get, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTokensService } from '../auth/api-tokens.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BackupService } from './backup.service';
import { CreateApiTokenDto, UpdateAuthPolicyDto, UpdateBackupPolicyDto, UpdateMapPolicyDto } from './dto/system-settings.dto';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SystemAdmin')
@Controller('api/system')
export class SystemSettingsController {
  constructor(
    private settings: SettingsService,
    private backups: BackupService,
    private apiTokens: ApiTokensService,
    private audit: AuditLogsService,
  ) {}

  @Get('auth-policy')
  getAuthPolicy() {
    return this.settings.getAuthPolicy();
  }

  @Put('auth-policy')
  async updateAuthPolicy(@Body() dto: UpdateAuthPolicyDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const result = await this.settings.saveAuthPolicy(dto);
    await this.audit.log({ userId: user.userId, actionType: 'AUTH_POLICY_UPDATE', targetResource: 'system', details: result, ipAddress: req.ip });
    return result;
  }

  @Get('map')
  getMapPolicy() {
    return this.settings.getMapPolicy();
  }

  @Put('map')
  async updateMapPolicy(@Body() dto: UpdateMapPolicyDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const result = await this.settings.saveMapPolicy(dto);
    await this.audit.log({ userId: user.userId, actionType: 'MAP_POLICY_UPDATE', targetResource: 'system', details: result, ipAddress: req.ip });
    return result;
  }

  @Get('backup')
  async getBackup() {
    const [policy, status, files] = await Promise.all([
      this.settings.getBackupPolicy(),
      this.backups.getStatus(),
      this.backups.listFiles(),
    ]);
    return { policy, status, files };
  }

  @Put('backup')
  async updateBackup(@Body() dto: UpdateBackupPolicyDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const result = await this.settings.saveBackupPolicy(dto);
    await this.audit.log({ userId: user.userId, actionType: 'BACKUP_POLICY_UPDATE', targetResource: 'system', details: result, ipAddress: req.ip });
    return result;
  }

  @Post('backup/run')
  async runBackup(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const result = await this.backups.runNow();
    await this.audit.log({ userId: user.userId, actionType: 'BACKUP_RUN', targetResource: 'system', details: result, ipAddress: req.ip });
    return result;
  }

  @Get('backup/files/:name')
  downloadBackup(@Param('name') name: string, @Res() res: Response) {
    return res.download(this.backups.resolveDownload(name), name);
  }

  @Get('api-tokens')
  listApiTokens() {
    return this.apiTokens.list();
  }

  @Post('api-tokens')
  async createApiToken(@Body() dto: CreateApiTokenDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const result = await this.apiTokens.create(dto);
    await this.audit.log({ userId: user.userId, actionType: 'API_TOKEN_CREATE', targetResource: 'api-token', targetId: result.id, details: { name: result.name, ownerId: result.ownerId, readOnly: result.readOnly }, ipAddress: req.ip });
    return result;
  }

  @Delete('api-tokens/:id')
  async revokeApiToken(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const result = await this.apiTokens.revoke(id);
    await this.audit.log({ userId: user.userId, actionType: 'API_TOKEN_REVOKE', targetResource: 'api-token', targetId: id, ipAddress: req.ip });
    return result;
  }
}
