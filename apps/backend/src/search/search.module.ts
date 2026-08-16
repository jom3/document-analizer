import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { DocumentIndexService } from './document-index.service.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [AiModule],
  controllers: [SearchController],
  providers: [DocumentIndexService, SearchService],
  exports: [DocumentIndexService],
})
export class SearchModule {}
