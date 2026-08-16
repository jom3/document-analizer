import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentStatus } from '../../../generated/prisma/enums.js';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DocumentIndexService } from '../document-index.service.js';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const indexer = app.get(DocumentIndexService);

  const documents = await prisma.document.findMany({
    where: { status: DocumentStatus.COMPLETED, index: null },
    select: { id: true, name: true },
  });

  console.log(`Documentos a indexar: ${documents.length}`);

  for (const document of documents) {
    await indexer.indexDocument(document.id);
    console.log(`Indexado: ${document.name}`);
  }

  await app.close();
}

void main();
