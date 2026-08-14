import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [PrismaModule, PermissionsModule],
  providers: [PortalService, SearchService],
  controllers: [PortalController, SearchController],
})
export class PortalModule {}
