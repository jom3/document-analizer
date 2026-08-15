import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AnalysisStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAX_ANALYSIS_CHARS } from './ai.constants.js';
import { OpenAiService } from './openai.service.js';
import { validateKeyInfo } from './schemas/key-info.zod.js';

@Injectable()
export class DocumentAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
  ) {}

  async analyze(documentId: string): Promise<void> {
    const text = await this.loadDocumentText(documentId);

    if (!text) {
      await this.saveAnalysis(documentId, {
        status: AnalysisStatus.FAILED,
        errorMessage: 'El documento no tiene texto para analizar',
      });
      return;
    }

    const truncated = text.length > MAX_ANALYSIS_CHARS;
    const input = truncated ? text.slice(0, MAX_ANALYSIS_CHARS) : text;

    try {
      const result = await this.openai.analyzeDocument(input);
      validateKeyInfo(result.documentType, result.keyInfo);
      await this.saveAnalysis(documentId, {
        status: AnalysisStatus.COMPLETED,
        documentType: result.documentType,
        summary: result.summary,
        keyInfo: result.keyInfo as Prisma.InputJsonValue,
        confidence: Math.round(result.confidence),
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        truncated,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      await this.saveAnalysis(documentId, {
        status: AnalysisStatus.FAILED,
        errorMessage: message,
      });
    }
  }

  private async loadDocumentText(documentId: string): Promise<string> {
    const pages = await this.prisma.documentPage.findMany({
      where: { documentId },
      orderBy: { pageNumber: 'asc' },
      select: { text: true },
    });
    return pages
      .map((page) => page.text)
      .join('\n')
      .trim();
  }

  private async saveAnalysis(
    documentId: string,
    data: {
      status: AnalysisStatus;
      documentType?: string;
      summary?: string;
      keyInfo?: Prisma.InputJsonValue;
      confidence?: number;
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      truncated?: boolean;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.prisma.documentAnalysis.create({
      data: {
        documentId,
        status: data.status,
        documentType: data.documentType ?? null,
        summary: data.summary ?? null,
        keyInfo: data.keyInfo,
        confidence: data.confidence ?? null,
        model: data.model ?? '',
        promptTokens: data.promptTokens ?? 0,
        completionTokens: data.completionTokens ?? 0,
        totalTokens: data.totalTokens ?? 0,
        truncated: data.truncated ?? false,
        errorMessage: data.errorMessage ?? null,
      },
    });
  }
}
