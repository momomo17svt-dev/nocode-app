import { Module } from '@nestjs/common';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsService } from './public-forms.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RecordsModule } from '../records/records.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, RecordsModule, AuditLogsModule],
  controllers: [PublicFormsController],
  providers: [PublicFormsService],
})
export class PublicFormsModule {}
