import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Processor } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.js';

export const LEAD_SCORING_QUEUE = 'lead-scoring';

export interface LeadScoringJob {
  batchId: string;
  tenantId: string;
  leadId: string;
}

/**
 * Owns the BullMQ Queue + Worker for the lead-scoring batches. The worker
 * processor is wired by LeadScoringService.onModuleInit so circular imports
 * stay out of the constructor.
 */
@Injectable()
export class LeadScoringQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadScoringQueue.name);
  private connection!: IORedis;
  private queue!: Queue<LeadScoringJob>;
  private worker?: Worker<LeadScoringJob>;
  private processor?: Processor<LeadScoringJob>;

  onModuleInit() {
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<LeadScoringJob>(LEAD_SCORING_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
        removeOnFail: { count: 5000, age: 7 * 24 * 60 * 60 },
        attempts: 1, // Don't retry — re-running scoring would cost tokens twice.
      },
    });
    this.logger.log(`Queue "${LEAD_SCORING_QUEUE}" ready`);
  }

  /** Registers the actual scoring processor (called once by LeadScoringService). */
  registerProcessor(processor: Processor<LeadScoringJob>, concurrency = 4) {
    if (this.worker) {
      this.logger.warn('Worker already registered — ignoring duplicate call');
      return;
    }
    this.processor = processor;
    this.worker = new Worker<LeadScoringJob>(LEAD_SCORING_QUEUE, processor, {
      connection: this.connection,
      concurrency,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job ${job?.id ?? '?'} failed (batch=${job?.data.batchId}): ${err.message}`,
      );
    });
  }

  enqueue(job: LeadScoringJob) {
    return this.queue.add('score-lead', job, { jobId: `${job.batchId}:${job.leadId}` });
  }

  enqueueMany(jobs: LeadScoringJob[]) {
    return this.queue.addBulk(
      jobs.map((j) => ({
        name: 'score-lead',
        data: j,
        opts: { jobId: `${j.batchId}:${j.leadId}` },
      })),
    );
  }

  /** Removes any waiting jobs that belong to a batch so cancel takes effect. */
  async removeWaitingForBatch(batchId: string) {
    const jobs = await this.queue.getJobs(['waiting', 'delayed', 'paused']);
    for (const job of jobs) {
      if (job.data.batchId === batchId) await job.remove().catch(() => {});
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}
