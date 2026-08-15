import { Module } from '@nestjs/common';
import { DocumentProcessingService } from './document-processing.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentProcessingService],
})
export class DocumentsModule {}
