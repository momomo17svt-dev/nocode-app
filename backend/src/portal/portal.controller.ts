import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PortalService } from './portal.service';

@UseGuards(JwtAuthGuard)
@Controller('api/portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.portal.summary(user.userId, user.role);
  }
}
