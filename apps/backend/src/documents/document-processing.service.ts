import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const standardFontDataUrl = `${join(
  dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
  'standard_fonts',
)}/`;

@Injectable()
export class DocumentProcessingService {
  constructor(private readonly prisma: PrismaService) {}

  async processDocument(documentId: string): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.PROCESSING },
    });

    const filePath = join(this.storagePath, document.storageKey);
    const data = new Uint8Array(await readFile(filePath));
    const pdf = await getDocument({
      data,
      standardFontDataUrl,
    }).promise;

    const pageCount = pdf.numPages;
    const { info } = await pdf.getMetadata().catch(() => ({
      info: {},
    }));
    const metadata = info as Record<string, unknown>;
    const title = this.sanitize(metadata.Title);
    const author = this.sanitize(metadata.Author);

    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\u0000/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      pageTexts.push(text);
    }

    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.COMPLETED,
          pageCount,
          title,
          author,
          errorMessage: null,
        },
      }),
      this.prisma.documentPage.createMany({
        data: pageTexts.map((text, index) => ({
          documentId,
          pageNumber: index + 1,
          text,
        })),
      }),
    ]);
  }

  private sanitize(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return value.replace(/\u0000/g, '').trim() || null;
  }

  private get storagePath(): string {
    return resolve(process.env.STORAGE_PATH ?? './storage');
  }
}
