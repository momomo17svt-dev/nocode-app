import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BackupService } from './backup.service';
import { SettingsModule } from './settings.module';
import { SystemSettingsController } from './system-settings.controller';

@Module({
  imports: [PrismaModule, SettingsModule, AuthModule, AuditLogsModule],
  controllers: [SystemSettingsController],
  providers: [BackupService],
})
export class SystemSettingsModule {}
