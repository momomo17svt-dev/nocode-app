import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { DashboardsService } from './dashboards.service';
import { DashboardsController } from './dashboards.controller';

@Module({
  imports: [PrismaModule, PermissionsModule],
  providers: [DashboardsService],
  controllers: [DashboardsController],
})
export class DashboardsModule {}
