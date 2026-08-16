import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { SEARCH_DEFAULT_LIMIT } from './search.constants.js';
import { SearchService } from './search.service.js';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  async query(
    @Req() req: Request,
    @Query('q') q: string,
    @Query('documentId') documentId?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNumber = Math.max(
      1,
      Number.parseInt(limit ?? '', 10) || SEARCH_DEFAULT_LIMIT,
    );
    return this.search.search((req.user as AccessTokenPayload).sub, q, {
      documentId,
      limit: limitNumber,
    });
  }
}
