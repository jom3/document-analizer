import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string; db: string }> {
    const dbUp = await this.prismaService.isConnected();
    return { status: 'ok', db: dbUp ? 'up' : 'down' };
  }
}
