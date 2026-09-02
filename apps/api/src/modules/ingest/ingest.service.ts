import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eventBatchSchema, type EventBatchInput } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { LifecycleService } from '../lifecycle/lifecycle.service.js';
import { IngestQueue, type IngestJob } from './ingest.queue.js';

/**
 * Ingesta del plano de datos (F1): la API valida y encola (202); el
 * procesador resuelve identidad, escribe eventos (dedupe por externalId) y
 * dispara el motor de ciclo de vida por cada evento NUEVO. Los reintentos
 * del job son seguros: el dedupe hace la escritura idempotente.
 */
@Injectable()
export class IngestService implements OnModuleInit {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
    private readonly lifecycle: LifecycleService,
    private readonly queue: IngestQueue,
  ) {}

  onModuleInit() {
    this.queue.registerProcessor(async (job) => {
      const data = job.data as IngestJob;
      if (data.kind === 'ingest-batch') {
        await this.processBatch(data.tenantId, data.batch);
      } else {
        await this.lifecycle.sweep(data.tenantId);
      }
    });
    // Barrido diario por tenant activo (idempotente: jobId fijo por tenant).
    void this.scheduleSweeps().catch((err) =>
      this.logger.warn(`no se pudieron programar los barridos: ${err.message}`),
    );
  }

  private async scheduleSweeps() {
    const tenants = await this.prisma.bypass((tx) =>
      tx.tenant.findMany({
        where: { status: { in: ['TRIAL', 'ACTIVE'] } },
        select: { id: true },
      }),
    );
    for (const t of tenants) await this.queue.scheduleSweep(t.id);
    this.logger.log(`lifecycle-sweep programado para ${tenants.length} tenants`);
  }

  /** Entrada HTTP: valida y encola. El 202 es contrato, no cortesía. */
  async ingestBatch(tenantId: string, input: EventBatchInput) {
    const batch = eventBatchSchema.parse(input);
    await this.queue.enqueueBatch(tenantId, batch);
    return { queued: true, events: batch.events.length };
  }

  /** Cuerpo del job (también invocable en línea desde tests/adaptadores). */
  async processBatch(tenantId: string, input: EventBatchInput) {
    const batch = eventBatchSchema.parse(input);
    let accepted = 0;
    let deduped = 0;

    for (const ev of batch.events) {
      // 1. Identidad (fuera de la transacción del evento).
      const profile = ev.identity
        ? await this.profiles.resolveForEvent(tenantId, ev.identity, { source: batch.source })
        : null;

      // 2. Evento con dedupe: el unique [tenantId, source, externalId] convierte
      //    la reentrega de un webhook en un no-op detectable.
      const inserted = await this.prisma.withTenant(tenantId, async (tx) => {
        try {
          await tx.event.create({
            data: {
              tenantId,
              profileId: profile?.id,
              type: ev.type,
              source: batch.source,
              occurredAt: ev.occurredAt ?? new Date(),
              externalId: ev.externalId,
              props: (ev.props as never) ?? undefined,
            },
          });
          return true;
        } catch (err) {
          if ((err as { code?: string }).code === 'P2002') return false; // duplicado
          throw err;
        }
      });

      if (!inserted) {
        deduped++;
        continue;
      }
      accepted++;

      // 3. Ciclo de vida: solo los eventos NUEVOS transicionan estados.
      if (profile) {
        await this.lifecycle
          .applyEvent(tenantId, profile.id, ev.type)
          .catch((err) => this.logger.warn(`lifecycle applyEvent falló: ${err.message}`));
      }
    }

    if (deduped) this.logger.debug(`ingest ${batch.source}: ${deduped} duplicados ignorados`);
    return { accepted, deduped };
  }
}
