import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpenAiService } from '../ai/openai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SEARCH_DEFAULT_LIMIT } from './search.constants.js';

export interface SearchResultItem {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  text: string;
  score: number;
}

interface SearchRow {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  text: string;
  score: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
  ) {}

  async search(
    ownerId: string,
    query: string,
    options: { documentId?: string; limit?: number } = {},
  ): Promise<SearchResultItem[]> {
    const trimmed = query?.trim();
    if (!trimmed) {
      throw new BadRequestException('El parámetro q es requerido');
    }

    if (options.documentId) {
      const document = await this.prisma.document.findFirst({
        where: { id: options.documentId, ownerId },
        select: { id: true },
      });
      if (!document) {
        throw new NotFoundException('Documento no encontrado');
      }
    }

    const limit = Math.min(
      20,
      Math.max(1, options.limit ?? SEARCH_DEFAULT_LIMIT),
    );

    const { embeddings } = await this.openai.createEmbeddings([trimmed]);
    const queryVector = `[${embeddings[0].join(',')}]`;

    const values: unknown[] = [queryVector, ownerId, limit];
    const limitPlaceholder = `$${values.length}`;
    const documentFilter = options.documentId
      ? `AND c."documentId" = $${values.length + 1}`
      : '';
    if (options.documentId) {
      values.push(options.documentId);
    }

    const sql = `
      SELECT c.id AS "chunkId",
             c."documentId",
             d.name AS "documentName",
             c."pageNumber",
             c.text,
             GREATEST(0, 1 - (c.embedding <=> $1::vector)) AS score
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE d."ownerId" = $2
        ${documentFilter}
      ORDER BY c.embedding <=> $1::vector
      LIMIT ${limitPlaceholder}
    `;

    const rows = await this.prisma.$queryRawUnsafe<SearchRow[]>(sql, ...values);

    return rows.map((row) => ({
      ...row,
      score: Number(row.score.toFixed(4)),
    }));
  }
}
