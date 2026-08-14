import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { SearchService } from './search.service';

@UseGuards(JwtAuthGuard)
@Controller('api/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@Query('q') q: string, @CurrentUser() user: AuthUser) {
    return this.search.search(user.userId, user.role, q);
  }
}
