import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { LoginDto, ChangePasswordDto } from './dto/login.dto';

@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private audit: AuditLogsService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const result = await this.authService.login(dto.loginId, dto.password);
    await this.audit.log({
      userId: result.user.id,
      actionType: 'LOGIN',
      targetResource: 'auth',
      targetId: result.user.id,
      ipAddress: req.ip,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Req() req: any) {
    await this.audit.log({
      userId: user.userId,
      actionType: 'LOGOUT',
      targetResource: 'auth',
      targetId: user.userId,
      ipAddress: req.ip,
    });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: any) {
    const result = await this.authService.changePassword(
      user.userId,
      user.loginId,
      dto.currentPassword,
      dto.newPassword,
    );
    await this.audit.log({
      userId: user.userId,
      actionType: 'CHANGE_PASSWORD',
      targetResource: 'user',
      targetId: user.userId,
      ipAddress: req.ip,
    });
    return result;
  }
}
