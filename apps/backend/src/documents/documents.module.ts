import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SearchModule } from '../search/search.module.js';
import { DOCUMENT_QUEUE_NAME } from './document-job.constants.js';
import { DocumentJobService } from './document-job.service.js';
import { DocumentProcessingProcessor } from './document-processing.processor.js';
import { DocumentProcessingService } from './document-processing.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [
    AiModule,
    SearchModule,
    BullModule.registerQueue({ name: DOCUMENT_QUEUE_NAME }),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentProcessingService,
    DocumentJobService,
    DocumentProcessingProcessor,
  ],
})
export class DocumentsModule {}
