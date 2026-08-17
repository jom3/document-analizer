import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentJobService } from './document-job.service.js';
import {
  ALLOWED_MIME_TYPES,
  MAX_NAME_LENGTH,
  PDF_MAGIC_NUMBER,
} from './document.constants.js';

interface CreateDocumentInput {
  file?: Express.Multer.File;
  name?: string;
  keepOriginalName: boolean;
}

export interface DocumentStats {
  total: number;
  processed: number;
  processing: number;
  failed: number;
  byType: Array<{ type: string; count: number }>;
  activity: Array<{ weekStart: string; count: number }>;
  recent: Array<{
    id: string;
    name: string;
    originalName: string;
    status: string;
    documentType: string | null;
    createdAt: string;
  }>;
}

const STATS_WEEKS = 12;
const DOCUMENT_TYPES = ['invoice', 'resume', 'contract', 'generic'] as const;
const UNCLASSIFIED_TYPE = 'unclassified';

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const daysSinceMonday =
    result.getUTCDay() === 0 ? -6 : 1 - result.getUTCDay();
  result.setUTCDate(result.getUTCDate() + daysSinceMonday);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function formatWeek(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countOf(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value === 'object' && '_all' in value) {
    const total = (value as { _all: unknown })._all;
    if (typeof total === 'number') {
      return total;
    }
  }
  return 0;
}

function lastWeekStarts(count: number): Date[] {
  const current = startOfWeek(new Date());
  const starts: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const week = new Date(current);
    week.setUTCDate(week.getUTCDate() - i * 7);
    starts.push(week);
  }
  return starts;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: DocumentJobService,
  ) {}

  async create(ownerId: string, input: CreateDocumentInput) {
    const { file, name, keepOriginalName } = input;

    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }

    const extension = this.resolveExtension(file.originalname, file.mimetype);
    const documentName = this.resolveName(
      name,
      keepOriginalName,
      file.originalname,
    );

    const storageKey = `${randomUUID()}.${extension}`;
    const directory = this.storagePath;
    const fullPath = join(directory, storageKey);

    await mkdir(directory, { recursive: true });

    try {
      await writeFile(fullPath, file.buffer);
    } catch {
      throw new BadRequestException('No se pudo guardar el archivo');
    }

    if (!(await this.hasValidMagicNumber(fullPath))) {
      await unlink(fullPath).catch(() => undefined);
      throw new BadRequestException('Tipo de archivo no permitido');
    }

    const document = await this.prisma.document
      .create({
        data: {
          name: documentName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          extension,
          size: file.size,
          storageKey,
          ownerId,
          status: DocumentStatus.QUEUED,
        },
      })
      .catch(async (error) => {
        await unlink(fullPath).catch(() => undefined);
        throw error;
      });

    try {
      await this.jobs.enqueueProcess(document.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.FAILED, errorMessage: message },
      });
      throw error;
    }

    return this.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
  }

  async findAll(ownerId: string, page: number, limit: number) {
    const where = { ownerId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async stats(ownerId: string): Promise<DocumentStats> {
    const weeks = lastWeekStarts(STATS_WEEKS);

    const [statusGroups, typeGroups, activityDocs, recentDocs] =
      await this.prisma.$transaction([
        this.prisma.document.groupBy({
          by: ['status'],
          where: { ownerId },
          orderBy: { status: 'asc' },
          _count: true,
        }),
        this.prisma.documentAnalysis.groupBy({
          by: ['documentType'],
          where: { document: { ownerId } },
          orderBy: { documentType: 'asc' },
          _count: true,
        }),
        this.prisma.document.findMany({
          where: { ownerId, createdAt: { gte: weeks[0] } },
          select: { createdAt: true },
        }),
        this.prisma.document.findMany({
          where: { ownerId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { analysis: { select: { documentType: true } } },
        }),
      ]);

    const statusCounts = new Map<string, number>();
    for (const group of statusGroups) {
      statusCounts.set(group.status, countOf(group._count));
    }

    const total = [...statusCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    );
    const processed = statusCounts.get(DocumentStatus.COMPLETED) ?? 0;
    const processing =
      (statusCounts.get(DocumentStatus.UPLOADED) ?? 0) +
      (statusCounts.get(DocumentStatus.QUEUED) ?? 0) +
      (statusCounts.get(DocumentStatus.PROCESSING) ?? 0);
    const failed = statusCounts.get(DocumentStatus.FAILED) ?? 0;

    const typeCounts = new Map<string, number>();
    for (const group of typeGroups) {
      if (group.documentType) {
        typeCounts.set(group.documentType, countOf(group._count));
      }
    }
    const byType: Array<{ type: string; count: number }> = DOCUMENT_TYPES.map(
      (type) => ({ type, count: typeCounts.get(type) ?? 0 }),
    );
    const classifiedTotal = byType.reduce((sum, entry) => sum + entry.count, 0);
    byType.push({
      type: UNCLASSIFIED_TYPE,
      count: total - classifiedTotal,
    });

    const weekCounts = new Map<string, number>();
    for (const week of weeks) {
      weekCounts.set(formatWeek(week), 0);
    }
    for (const doc of activityDocs) {
      const key = formatWeek(startOfWeek(doc.createdAt));
      if (weekCounts.has(key)) {
        weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
      }
    }
    const activity = weeks.map((week) => {
      const weekStart = formatWeek(week);
      return { weekStart, count: weekCounts.get(weekStart) ?? 0 };
    });

    const recent = recentDocs.map((doc) => ({
      id: doc.id,
      name: doc.name,
      originalName: doc.originalName,
      status: doc.status,
      documentType: doc.analysis?.documentType ?? null,
      createdAt: doc.createdAt.toISOString(),
    }));

    return { total, processed, processing, failed, byType, activity, recent };
  }

  async findOne(ownerId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerId },
      include: { job: true },
    });
    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }
    return document;
  }

  async getDownload(ownerId: string, id: string) {
    const document = await this.findOne(ownerId, id);
    const filePath = join(this.storagePath, document.storageKey);
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException('Archivo no encontrado en el almacenamiento');
    }
    return { document, stream: createReadStream(filePath) };
  }

  async getPages(ownerId: string, id: string) {
    await this.findOne(ownerId, id);
    return this.prisma.documentPage.findMany({
      where: { documentId: id },
      orderBy: { pageNumber: 'asc' },
      select: { pageNumber: true, text: true },
    });
  }

  async getAnalysis(ownerId: string, id: string) {
    await this.findOne(ownerId, id);
    const analysis = await this.prisma.documentAnalysis.findUnique({
      where: { documentId: id },
    });
    if (!analysis) {
      throw new NotFoundException('Análisis no encontrado');
    }
    return analysis;
  }

  async reindex(ownerId: string, id: string) {
    await this.findOne(ownerId, id);
    await this.jobs.enqueueReindex(id);
    return { message: 'Documento en cola para reindexar' };
  }

  async remove(ownerId: string, id: string) {
    const document = await this.findOne(ownerId, id);
    await this.prisma.document.delete({ where: { id: document.id } });
    await unlink(join(this.storagePath, document.storageKey)).catch(
      () => undefined,
    );
  }

  private get storagePath(): string {
    return resolve(process.env.STORAGE_PATH ?? './storage');
  }

  private async hasValidMagicNumber(filePath: string): Promise<boolean> {
    const handle = await open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(PDF_MAGIC_NUMBER.length);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return (
        bytesRead === PDF_MAGIC_NUMBER.length &&
        buffer.toString('ascii') === PDF_MAGIC_NUMBER
      );
    } finally {
      await handle.close();
    }
  }

  private resolveExtension(originalName: string, mimetype: string): string {
    const allowedExtension = ALLOWED_MIME_TYPES[mimetype];
    if (!allowedExtension) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }
    const extension = extname(originalName).slice(1).toLowerCase();
    if (extension !== allowedExtension.slice(1)) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }
    return extension;
  }

  private resolveName(
    name: string | undefined,
    keepOriginalName: boolean,
    originalName: string,
  ): string {
    if (keepOriginalName) {
      return originalName.slice(0, MAX_NAME_LENGTH);
    }

    const trimmed = name?.trim();
    if (!trimmed) {
      throw new BadRequestException('El nombre del documento es requerido');
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(
        `El nombre no puede superar ${MAX_NAME_LENGTH} caracteres`,
      );
    }
    return trimmed;
  }
}
