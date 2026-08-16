import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IndexStatus } from '../../generated/prisma/enums.js';
import { OpenAiService } from '../ai/openai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { chunkText } from './chunker.js';
import { EMBEDDING_MODEL, MAX_EMBEDDING_BATCH } from './search.constants.js';

interface ChunkInput {
  pageNumber: number;
  chunkIndex: number;
  text: string;
}

@Injectable()
export class DocumentIndexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
  ) {}

  async indexDocument(documentId: string): Promise<void> {
    const chunks = await this.buildChunks(documentId);

    if (chunks.length === 0) {
      await this.saveStatus(documentId, {
        status: IndexStatus.FAILED,
        chunkCount: 0,
        totalTokens: 0,
        errorMessage: 'El documento no tiene texto indexable',
      });
      return;
    }

    try {
      const totalTokens = await this.persistChunks(documentId, chunks);
      await this.saveStatus(documentId, {
        status: IndexStatus.INDEXED,
        chunkCount: chunks.length,
        totalTokens,
      });
    } catch (error) {
      await this.prisma.documentChunk.deleteMany({ where: { documentId } });
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      await this.saveStatus(documentId, {
        status: IndexStatus.FAILED,
        chunkCount: 0,
        totalTokens: 0,
        errorMessage: message,
      });
    }
  }

  async deleteChunks(documentId: string): Promise<void> {
    await this.prisma.documentChunk.deleteMany({ where: { documentId } });
  }

  private async buildChunks(documentId: string): Promise<ChunkInput[]> {
    const pages = await this.prisma.documentPage.findMany({
      where: { documentId },
      orderBy: { pageNumber: 'asc' },
      select: { pageNumber: true, text: true },
    });

    const chunks: ChunkInput[] = [];
    for (const page of pages) {
      if (!page.text.trim()) {
        continue;
      }
      chunkText(page.text).forEach((text, chunkIndex) => {
        chunks.push({ pageNumber: page.pageNumber, chunkIndex, text });
      });
    }
    return chunks;
  }

  private async persistChunks(
    documentId: string,
    chunks: ChunkInput[],
  ): Promise<number> {
    let totalTokens = 0;

    for (let i = 0; i < chunks.length; i += MAX_EMBEDDING_BATCH) {
      const batch = chunks.slice(i, i + MAX_EMBEDDING_BATCH);
      const { embeddings, totalTokens: batchTokens } =
        await this.openai.createEmbeddings(batch.map((chunk) => chunk.text));
      await this.insertChunkBatch(documentId, batch, embeddings);
      totalTokens += batchTokens;
    }

    return totalTokens;
  }

  private async insertChunkBatch(
    documentId: string,
    batch: ChunkInput[],
    embeddings: number[][],
  ): Promise<void> {
    const placeholders: string[] = [];
    const values: unknown[] = [];

    batch.forEach((chunk, index) => {
      const offset = values.length;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::vector)`,
      );
      values.push(
        randomUUID(),
        documentId,
        chunk.pageNumber,
        chunk.chunkIndex,
        chunk.text,
        `[${embeddings[index].join(',')}]`,
      );
    });

    const sql = `INSERT INTO "DocumentChunk" (id, "documentId", "pageNumber", "chunkIndex", text, embedding) VALUES ${placeholders.join(', ')}`;
    await this.prisma.$executeRawUnsafe(sql, ...values);
  }

  private async saveStatus(
    documentId: string,
    data: {
      status: IndexStatus;
      chunkCount: number;
      totalTokens: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.prisma.documentIndex.upsert({
      where: { documentId },
      create: {
        documentId,
        status: data.status,
        model: process.env.EMBEDDING_MODEL ?? EMBEDDING_MODEL,
        chunkCount: data.chunkCount,
        totalTokens: data.totalTokens,
        errorMessage: data.errorMessage ?? null,
      },
      update: {
        status: data.status,
        model: process.env.EMBEDDING_MODEL ?? EMBEDDING_MODEL,
        chunkCount: data.chunkCount,
        totalTokens: data.totalTokens,
        errorMessage: data.errorMessage ?? null,
        indexedAt: new Date(),
      },
    });
  }
}
