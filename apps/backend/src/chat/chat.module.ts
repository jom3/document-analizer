import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SearchModule } from '../search/search.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [AiModule, SearchModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
