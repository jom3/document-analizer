import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('sessions')
  listSessions(@Req() req: Request, @Query('documentId') documentId?: string) {
    return this.chat.listSessions(this.ownerId(req), documentId ?? '');
  }

  @Post('sessions')
  createSession(
    @Req() req: Request,
    @Body() body: { documentId: string; title?: string },
  ) {
    return this.chat.createSession(this.ownerId(req), body);
  }

  @Patch('sessions/:id')
  renameSession(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { title: string },
  ) {
    return this.chat.renameSession(this.ownerId(req), id, body.title);
  }

  @Delete('sessions/:id')
  async deleteSession(@Req() req: Request, @Param('id') id: string) {
    await this.chat.deleteSession(this.ownerId(req), id);
    return { message: 'Sesión eliminada' };
  }

  @Get('sessions/:id/messages')
  listMessages(@Req() req: Request, @Param('id') id: string) {
    return this.chat.listMessages(this.ownerId(req), id);
  }

  @Post('sessions/:id/messages')
  async sendMessage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { content: string },
    @Res() res: Response,
  ): Promise<void> {
    await this.chat.ask(this.ownerId(req), id, body.content, res);
  }

  private ownerId(req: Request): string {
    return (req.user as AccessTokenPayload).sub;
  }
}
