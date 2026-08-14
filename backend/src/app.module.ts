import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { AppsModule } from './apps/apps.module';
import { RecordsModule } from './records/records.module';
import { FieldsModule } from './fields/fields.module';
import { ViewsModule } from './views/views.module';
import { AppPermissionsModule } from './app-permissions/app-permissions.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { DirectoryModule } from './directory/directory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PortalModule } from './portal/portal.module';
import { TilesModule } from './tiles/tiles.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { LlmModule } from './llm/llm.module';
import { AiModule } from './ai/ai.module';
import { PublicFormsModule } from './public-forms/public-forms.module';
import { RequestObservabilityMiddleware } from './common/request-observability.middleware';
import { CsrfProtectionMiddleware } from './auth/csrf-protection.middleware';
import { SettingsModule } from './system-settings/settings.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';

@Module({
  imports: [PrismaModule, SettingsModule, AuthModule, SystemSettingsModule, UsersModule, GroupsModule, AppsModule, RecordsModule, FieldsModule, ViewsModule, AppPermissionsModule, AttachmentsModule, AuditLogsModule, DirectoryModule, NotificationsModule, PortalModule, TilesModule, DashboardsModule, LlmModule, AiModule, PublicFormsModule],
  controllers: [AppController],
  providers: [AppService, RequestObservabilityMiddleware, CsrfProtectionMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestObservabilityMiddleware, CsrfProtectionMiddleware).forRoutes('*');
  }
}
