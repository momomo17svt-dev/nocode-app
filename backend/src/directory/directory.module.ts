import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { DirectoryController } from './directory.controller';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [DirectoryController],
})
export class DirectoryModule {}
