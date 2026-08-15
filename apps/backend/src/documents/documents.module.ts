import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { DocumentProcessingService } from './document-processing.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [AiModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentProcessingService],
})
export class DocumentsModule {}
