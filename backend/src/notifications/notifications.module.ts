import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsService } from './notifications.service';
import { ReminderService } from './reminder.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule, PermissionsModule],
  providers: [NotificationsService, ReminderService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
