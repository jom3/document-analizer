import { Module } from '@nestjs/common';
import { DocumentAnalysisService } from './document-analysis.service.js';
import { OpenAiService } from './openai.service.js';

@Module({
  providers: [OpenAiService, DocumentAnalysisService],
  exports: [DocumentAnalysisService],
})
export class AiModule {}
