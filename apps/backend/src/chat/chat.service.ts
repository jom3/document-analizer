import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Prisma } from '../../generated/prisma/client.js';
import { OpenAiService } from '../ai/openai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchService } from '../search/search.service.js';
import type { SearchResultItem } from '../search/search.service.js';
import {
  CHAT_CONTEXT_MAX_TOKENS,
  CHAT_HISTORY_MESSAGES,
  CHAT_RETRIEVAL_LIMIT,
} from './chat.constants.js';
import { CHAT_SYSTEM_PROMPT } from './prompts/chat.system.js';

interface ChatCitation {
  chunkId: string;
  pageNumber: number;
  text: string;
  score: number;
}

export interface CreateSessionInput {
  documentId: string;
  title?: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly openai: OpenAiService,
  ) {}

  async listSessions(ownerId: string, documentId: string) {
    await this.requireDocumentAndIndex(ownerId, documentId);
    return this.prisma.chatSession.findMany({
      where: { documentId, ownerId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createSession(ownerId: string, input: CreateSessionInput) {
    const document = await this.prisma.document.findFirst({
      where: { id: input.documentId, ownerId },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    return this.prisma.chatSession.create({
      data: {
        documentId: input.documentId,
        ownerId,
        title: input.title?.trim() || undefined,
      },
    });
  }

  async renameSession(ownerId: string, id: string, title: string) {
    await this.requireSession(ownerId, id);
    const trimmed = title?.trim();
    if (!trimmed) {
      throw new BadRequestException('El título no puede estar vacío');
    }
    return this.prisma.chatSession.update({
      where: { id },
      data: { title: trimmed },
    });
  }

  async deleteSession(ownerId: string, id: string): Promise<void> {
    await this.requireSession(ownerId, id);
    await this.prisma.chatSession.delete({ where: { id } });
  }

  async listMessages(ownerId: string, sessionId: string) {
    await this.requireSession(ownerId, sessionId);
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async ask(
    ownerId: string,
    sessionId: string,
    content: string,
    res: Response,
  ): Promise<void> {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, ownerId },
      select: { documentId: true },
    });
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      throw new BadRequestException('El mensaje no puede estar vacío');
    }

    await this.requireIndexed(session.documentId, ownerId);

    await this.prisma.chatMessage.create({
      data: { sessionId, role: 'USER', content: trimmed },
    });

    this.startSse(res);

    let answer = '';
    let citations: ChatCitation[] = [];

    try {
      const chunks = await this.search.search(ownerId, trimmed, {
        documentId: session.documentId,
        limit: CHAT_RETRIEVAL_LIMIT,
      });
      citations = chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        score: chunk.score,
      }));

      const messages = await this.buildMessages(sessionId, trimmed, chunks);
      const result = await this.openai.streamChatCompletion(messages);

      for await (const delta of result.deltas) {
        answer += delta;
        this.writeSse(res, { type: 'chunk', text: delta });
      }

      this.writeSse(res, { type: 'sources', sources: citations });

      const assistant = await this.prisma.chatMessage.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: answer,
          citations: this.toJson(citations),
          model: result.model,
          promptTokens: result.usage?.prompt_tokens ?? null,
          completionTokens: result.usage?.completion_tokens ?? null,
          totalTokens: result.usage?.total_tokens ?? null,
        },
      });

      this.writeSse(res, { type: 'done', messageId: assistant.id });
      res.end();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error generando la respuesta';
      this.writeSse(res, { type: 'error', message });
      await this.prisma.chatMessage.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: answer,
          citations: this.toJson(citations),
          errorMessage: message,
        },
      });
      res.end();
    }
  }

  private async buildMessages(
    sessionId: string,
    question: string,
    chunks: SearchResultItem[],
  ): Promise<ChatCompletionMessageParam[]> {
    const context = chunks
      .map((chunk) => `[Página ${chunk.pageNumber}]\n${chunk.text}`)
      .join('\n\n');

    const recent = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: CHAT_HISTORY_MESSAGES + 1,
    });
    const history = recent
      .slice(1)
      .reverse()
      .map((message): { role: 'user' | 'assistant'; content: string } => ({
        role: message.role === 'USER' ? 'user' : 'assistant',
        content: message.content,
      }));

    const estimate = (text: string): number => Math.ceil(text.length / 4);
    let total =
      estimate(CHAT_SYSTEM_PROMPT) +
      estimate(context) +
      estimate(question) +
      history.reduce((sum, message) => sum + estimate(message.content), 0);

    while (total > CHAT_CONTEXT_MAX_TOKENS && history.length > 0) {
      const removed = history.shift();
      if (removed) {
        total -= estimate(removed.content);
      }
    }

    return [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      { role: 'user', content: `<contexto>\n${context}\n</contexto>` },
      ...history,
      { role: 'user', content: question },
    ];
  }

  private async requireDocumentAndIndex(
    ownerId: string,
    documentId: string,
  ): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, ownerId },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }
    await this.requireIndexed(documentId, ownerId);
  }

  private async requireIndexed(
    documentId: string,
    ownerId: string,
  ): Promise<void> {
    const index = await this.prisma.documentIndex.findFirst({
      where: { documentId, document: { ownerId } },
      select: { status: true, chunkCount: true },
    });
    if (!index || index.status !== 'INDEXED' || index.chunkCount <= 0) {
      throw new ConflictException('El documento aún no está indexado');
    }
  }

  private async requireSession(ownerId: string, id: string): Promise<void> {
    const session = await this.prisma.chatSession.findFirst({
      where: { id, ownerId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
  }

  private toJson(citations: ChatCitation[]): Prisma.InputJsonValue | undefined {
    return citations.length > 0
      ? (citations as unknown as Prisma.InputJsonValue)
      : undefined;
  }

  private startSse(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  private writeSse(res: Response, payload: object): void {
    if (res.writableEnded || res.destroyed) {
      return;
    }
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}
