import { Module } from '@nestjs/common';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../system-settings/settings.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, UsersModule, SettingsModule, AuthModule, AuditLogsModule],
  providers: [SetupService],
  controllers: [SetupController],
})
export class SetupModule {}
