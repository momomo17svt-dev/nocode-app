import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../system-settings/settings.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, PermissionsModule, SettingsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
