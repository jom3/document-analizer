import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Prisma } from '../../generated/prisma/client.js';
import { JobStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DOCUMENT_QUEUE_NAME,
  JOB_ATTEMPTS,
  JOB_BACKOFF_DELAY,
  JOB_BACKOFF_TYPE,
  JOB_ENQUEUE_TIMEOUT,
} from './document-job.constants.js';

export type JobStage = 'processing' | 'analysis' | 'embeddings';

@Injectable()
export class DocumentJobService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DOCUMENT_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async enqueueProcess(documentId: string): Promise<void> {
    await this.prisma.documentJob.create({
      data: { documentId, jobId: documentId },
    });
    await this.enqueue('process', documentId, documentId);
  }

  async enqueueReindex(documentId: string): Promise<void> {
    const jobId = `reindex-${documentId}`;
    await this.prisma.documentJob.upsert({
      where: { documentId },
      create: { documentId, jobId },
      update: {
        jobId,
        status: JobStatus.QUEUED,
        attempts: 0,
        failReason: null,
        logs: [],
        startedAt: null,
        finishedAt: null,
      },
    });
    await this.enqueue('reindex', documentId, jobId);
  }

  private async enqueue(
    name: 'process' | 'reindex',
    documentId: string,
    jobId: string,
  ): Promise<void> {
    try {
      await this.withTimeout(
        this.queue.add(
          name,
          { documentId },
          {
            jobId,
            attempts: JOB_ATTEMPTS,
            backoff: { type: JOB_BACKOFF_TYPE, delay: JOB_BACKOFF_DELAY },
          },
        ),
        JOB_ENQUEUE_TIMEOUT,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      await this.markFailed(jobId, message).catch(() => undefined);
      throw error;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Tiempo de espera agotado al encolar el job')),
        ms,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async markActive(jobId: string, attempts: number): Promise<void> {
    await this.prisma.documentJob.update({
      where: { jobId },
      data: { status: JobStatus.ACTIVE, attempts, startedAt: new Date() },
    });
  }

  async appendLog(
    jobId: string,
    stage: JobStage,
    status: 'completed' | 'failed',
    message?: string,
  ): Promise<void> {
    const job = await this.prisma.documentJob.findUnique({ where: { jobId } });
    if (!job) {
      return;
    }
    const entry: Prisma.InputJsonValue = {
      stage,
      status,
      at: new Date().toISOString(),
      ...(message ? { message } : {}),
    };
    const logs: Prisma.InputJsonValue[] = Array.isArray(job.logs)
      ? (job.logs as Prisma.InputJsonValue[])
      : [];
    await this.prisma.documentJob.update({
      where: { jobId },
      data: { logs: [...logs, entry] },
    });
  }

  async markCompleted(jobId: string): Promise<void> {
    await this.prisma.documentJob.update({
      where: { jobId },
      data: { status: JobStatus.COMPLETED, finishedAt: new Date() },
    });
  }

  async markFailed(jobId: string, reason: string): Promise<void> {
    await this.prisma.documentJob.update({
      where: { jobId },
      data: {
        status: JobStatus.FAILED,
        failReason: reason,
        finishedAt: new Date(),
      },
    });
  }
}
