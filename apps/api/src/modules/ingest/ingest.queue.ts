import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Processor } from 'bullmq';
import IORedis from 'ioredis';
import type { EventBatchInput } from '@converflow/shared';
import { env } from '../../config/env.js';

export const INGEST_QUEUE = 'data-plane';

export type IngestJob =
  | { kind: 'ingest-batch'; tenantId: string; batch: EventBatchInput }
  | { kind: 'lifecycle-sweep'; tenantId: string }
  | { kind: 'embed'; tenantId: string }
  | { kind: 'monthly-report'; tenantId: string }
  | { kind: 'report-poll'; tenantId: string };

/**
 * Cola del plano de datos (patrón de lead-scoring.queue: Queue en el
 * constructor, Worker registrado lazy por el servicio). Dos trabajos:
 *  - ingest-batch: escritura asíncrona de eventos (la API responde 202)
 *  - lifecycle-sweep: barrido diario de reglas temporales por tenant
 */
@Injectable()
export class IngestQueue implements OnModuleDestroy {
  private readonly logger = new Logger(IngestQueue.name);
  private readonly connection: IORedis;
  private readonly queue: Queue<IngestJob>;
  private worker?: Worker<IngestJob>;

  constructor() {
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<IngestJob>(INGEST_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
        removeOnFail: { count: 5000, age: 7 * 24 * 60 * 60 },
        // La ingesta SÍ reintenta (a diferencia del scoring, no cuesta tokens
        // y el dedupe por externalId hace el reintento idempotente).
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
    this.logger.log(`Queue "${INGEST_QUEUE}" ready`);
  }

  registerProcessor(processor: Processor<IngestJob>, concurrency = 4) {
    if (this.worker) return;
    this.worker = new Worker<IngestJob>(INGEST_QUEUE, processor, {
      connection: this.connection,
      concurrency,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id ?? '?'} (${job?.data.kind}) failed: ${err.message}`);
    });
  }

  enqueueBatch(tenantId: string, batch: EventBatchInput) {
    return this.queue.add('ingest-batch', { kind: 'ingest-batch', tenantId, batch }, {
      jobId: `ingest-${tenantId}-${randomUUID()}`,
    });
  }

  /**
   * Vectorización en diferido. jobId fijo por tenant + delay corto: varias
   * altas seguidas de conocimiento colapsan en UNA pasada de embedPending.
   */
  enqueueEmbed(tenantId: string) {
    return this.queue
      .add(
        'embed',
        { kind: 'embed', tenantId },
        {
          jobId: `embed-${tenantId}`,
          delay: 2000,
          // Autolimpieza inmediata: un job completado que siga en Redis
          // bloquea silenciosamente el siguiente add con el mismo jobId
          // (la coalescencia solo debe aplicar mientras está pendiente).
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
      .catch((err: Error) => {
        // jobId duplicado con job aún pendiente → ya hay pasada programada.
        if (!/already exists/i.test(err.message)) throw err;
        return null;
      });
  }

  /** Barrido diario 04:15 — un job repetible por CADA tenant activo se
   *  programa desde el servicio al arrancar. */
  scheduleSweep(tenantId: string) {
    return this.queue.add(
      'lifecycle-sweep',
      { kind: 'lifecycle-sweep', tenantId },
      {
        jobId: `sweep-${tenantId}`,
        repeat: { pattern: '15 4 * * *' },
      },
    );
  }

  /** Informe mensual: día 1 a las 06:00 por tenant. */
  scheduleMonthlyReport(tenantId: string) {
    return this.queue.add(
      'monthly-report',
      { kind: 'monthly-report', tenantId },
      { jobId: `report-${tenantId}`, repeat: { pattern: '0 6 1 * *' } },
    );
  }

  /** Poll de narrativas en batch: cada 30 min, un único job global. */
  scheduleReportPoll() {
    return this.queue.add(
      'report-poll',
      { kind: 'report-poll', tenantId: '' },
      { jobId: 'report-poll', repeat: { pattern: '*/30 * * * *' } },
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}
