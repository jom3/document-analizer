import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { MAX_FILE_SIZE } from './document.constants.js';
import { DocumentsService } from './documents.service.js';
import { PayloadTooLargeFilter } from './payload-too-large.filter.js';

@Controller('documents')
@UseGuards(JwtAuthGuard)
@UseFilters(PayloadTooLargeFilter)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async create(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string; keepOriginalName?: string },
  ) {
    return this.documents.create(this.ownerId(req), {
      file,
      name: body.name,
      keepOriginalName: body.keepOriginalName !== 'false',
    });
  }

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number.parseInt(limit, 10) || 10),
    );
    return this.documents.findAll(this.ownerId(req), pageNumber, pageSize);
  }

  @Get('stats')
  async stats(@Req() req: Request) {
    return this.documents.stats(this.ownerId(req));
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    return this.documents.findOne(this.ownerId(req), id);
  }

  @Get(':id/download')
  async download(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { document, stream } = await this.documents.getDownload(
      this.ownerId(req),
      id,
    );
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.originalName.replace(/"/g, '')}"`,
    );
    return new StreamableFile(stream);
  }

  @Get(':id/pages')
  async pages(@Req() req: Request, @Param('id') id: string) {
    return this.documents.getPages(this.ownerId(req), id);
  }

  @Get(':id/analysis')
  async analysis(@Req() req: Request, @Param('id') id: string) {
    return this.documents.getAnalysis(this.ownerId(req), id);
  }

  @Post(':id/reindex')
  @HttpCode(202)
  async reindex(@Req() req: Request, @Param('id') id: string) {
    return this.documents.reindex(this.ownerId(req), id);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.documents.remove(this.ownerId(req), id);
    return { message: 'Documento eliminado' };
  }

  private ownerId(req: Request): string {
    return (req.user as AccessTokenPayload).sub;
  }
}
