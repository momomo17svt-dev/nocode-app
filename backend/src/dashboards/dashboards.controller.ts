import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { DashboardsService } from './dashboards.service';
import { ComputeWidgetsDto, CreateDashboardDto, UpdateDashboardDto } from './dto/dashboard.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  /** 自分が閲覧できるダッシュボード一覧（所有 + 共有先 + 全員公開）。 */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.dashboards.list(user.userId, user.role);
  }

  @Post()
  create(@Body() dto: CreateDashboardDto, @CurrentUser() user: AuthUser) {
    return this.dashboards.create(user.userId, user.role, dto);
  }

  /** ウィジェット群の集計データをまとめて算出（描画用）。 */
  @Post('data')
  data(@Body() dto: ComputeWidgetsDto, @CurrentUser() user: AuthUser) {
    return this.dashboards.computeWidgets(user.userId, user.role, dto.widgets || []);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDashboardDto, @CurrentUser() user: AuthUser) {
    return this.dashboards.update(id, user.userId, user.role, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.dashboards.remove(id, user.userId, user.role);
  }
}
