import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { ALLOWED_MIME_TYPES, MAX_NAME_LENGTH } from './document.constants.js';

interface CreateDocumentInput {
  file?: Express.Multer.File;
  name?: string;
  keepOriginalName: boolean;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

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

    try {
      return await this.prisma.document.create({
        data: {
          name: documentName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          extension,
          size: file.size,
          storageKey,
          ownerId,
        },
      });
    } catch (error) {
      await unlink(fullPath).catch(() => undefined);
      throw error;
    }
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

  async findOne(ownerId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerId },
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

  private resolveExtension(originalName: string, mimetype: string): string {
    const extension = extname(originalName).slice(1).toLowerCase();
    const allowedMime = ALLOWED_MIME_TYPES[extension];
    if (!allowedMime || allowedMime !== mimetype) {
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
