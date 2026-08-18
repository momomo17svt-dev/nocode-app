import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SetupService } from './setup.service';
import { CreateFirstAdminDto } from './dto/setup.dto';
import { AuthService } from '../auth/auth.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { setAuthCookies } from '../auth/auth-cookie.util';

/**
 * 初回セットアップ用のエンドポイント。
 * 管理者が1人もいない間だけ機能し、作成後は 403 を返すだけになるため、
 * 認証ガードを意図的に付けていない（ログインできる人がまだ存在しないため）。
 */
@Controller('api/setup')
export class SetupController {
  constructor(
    private readonly setup: SetupService,
    private readonly auth: AuthService,
    private readonly audit: AuditLogsService,
  ) {}

  /** 画面が「セットアップ画面を出すか、ログイン画面を出すか」を決めるために使う。 */
  @Get('status')
  status() {
    return this.setup.status();
  }

  /** 最初のシステム管理者を作成し、そのままサインインした状態にする。 */
  @HttpCode(HttpStatus.CREATED)
  @Post('admin')
  async createAdmin(
    @Body() dto: CreateFirstAdminDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.setup.createFirstAdmin(dto);
    setAuthCookies(
      res,
      this.auth.issueToken({ userId: user.id, loginId: user.loginId, role: user.role, authVersion: 0 }),
    );
    await this.audit.log({
      userId: user.id,
      actionType: 'SETUP_ADMIN',
      targetResource: 'setup',
      targetId: user.id,
      ipAddress: req.ip,
    });
    return { user };
  }
}
