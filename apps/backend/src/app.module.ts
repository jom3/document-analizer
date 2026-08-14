import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DocumentsModule } from './documents/documents.module.js';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule, DocumentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
