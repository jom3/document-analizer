import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { DocumentAnalysisService } from '../ai/document-analysis.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentIndexService } from '../search/document-index.service.js';
import {
  DOCUMENT_QUEUE_NAME,
  WORKER_CONCURRENCY,
} from './document-job.constants.js';
import { DocumentJobService, type JobStage } from './document-job.service.js';
import { DocumentProcessingService } from './document-processing.service.js';

interface JobData {
  documentId: string;
}

@Processor(DOCUMENT_QUEUE_NAME, { concurrency: WORKER_CONCURRENCY })
export class DocumentProcessingProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: DocumentJobService,
    private readonly processing: DocumentProcessingService,
    private readonly analysis: DocumentAnalysisService,
    private readonly indexer: DocumentIndexService,
  ) {
    super();
  }

  async process(job: Job<JobData>): Promise<void> {
    const { documentId } = job.data;
    const jobId = job.id as string;
    const attempts = job.attemptsMade + 1;

    await this.jobs.markActive(jobId, attempts);
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.PROCESSING },
    });

    try {
      if (job.name === 'reindex') {
        await this.indexer.deleteChunks(documentId);
        await this.runStage(jobId, 'embeddings', () =>
          this.indexer.indexDocument(documentId),
        );
      } else {
        await this.runStage(jobId, 'processing', () =>
          this.processing.processDocument(documentId),
        );
        await this.runStage(jobId, 'analysis', () =>
          this.analysis.analyze(documentId),
        );
        await this.runStage(jobId, 'embeddings', () =>
          this.indexer.indexDocument(documentId),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED, errorMessage: message },
      });
      await this.jobs.markFailed(jobId, message);
      throw error;
    }

    await this.jobs.markCompleted(jobId);
  }

  private async runStage(
    jobId: string,
    stage: JobStage,
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run();
      await this.jobs.appendLog(jobId, stage, 'completed');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      await this.jobs.appendLog(jobId, stage, 'failed', message);
      throw error;
    }
  }
}
