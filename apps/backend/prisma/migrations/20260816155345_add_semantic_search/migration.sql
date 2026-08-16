-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "IndexStatus" AS ENUM ('INDEXED', 'FAILED');

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentIndex" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "IndexStatus" NOT NULL DEFAULT 'INDEXED',
    "model" TEXT NOT NULL,
    "chunkCount" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_pageNumber_chunkIndex_key" ON "DocumentChunk"("documentId", "pageNumber", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentIndex_documentId_key" ON "DocumentIndex"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentIndex" ADD CONSTRAINT "DocumentIndex_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
