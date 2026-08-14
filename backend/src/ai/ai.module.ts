import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { LlmModule } from '../llm/llm.module';
import { AiService } from './ai.service';
import { EmbeddingService } from './embedding.service';
import { DocumentsService } from './documents.service';
import { AiController } from './ai.controller';

@Module({
  imports: [PrismaModule, PermissionsModule, LlmModule],
  providers: [AiService, EmbeddingService, DocumentsService],
  controllers: [AiController],
  exports: [EmbeddingService],
})
export class AiModule {}
