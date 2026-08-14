import { Module } from '@nestjs/common';
import { AppPermissionsService } from './app-permissions.service';
import { AppPermissionsController } from './app-permissions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, PermissionsModule, AuditLogsModule],
  providers: [AppPermissionsService],
  controllers: [AppPermissionsController],
})
export class AppPermissionsModule {}
