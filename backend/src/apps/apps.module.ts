import { Module } from '@nestjs/common';
import { AppsService } from './apps.service';
import { AppsController } from './apps.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RecordsModule } from '../records/records.module';

@Module({
  imports: [PrismaModule, PermissionsModule, AuditLogsModule, RecordsModule],
  providers: [AppsService],
  controllers: [AppsController],
  exports: [AppsService],
})
export class AppsModule {}
