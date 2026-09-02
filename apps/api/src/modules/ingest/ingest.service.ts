import { Injectable, Logger } from '@nestjs/common';
import { eventBatchSchema, type EventBatchInput } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';

/**
 * Ingesta del plano de datos (F0: escritura síncrona validada; F1 la mueve a
 * cola BullMQ con el patrón de lead-scoring y añade el motor de ciclo de
 * vida como consumidor).
 *
 * Dedupe: unique parcial [tenantId, source, externalId] — un webhook
 * reentregado con el mismo externalId no duplica; los eventos sin externalId
 * no se deduplican (NULLs no colisionan en el unique).
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
  ) {}

  async ingestBatch(tenantId: string, input: EventBatchInput) {
    const batch = eventBatchSchema.parse(input);

    // Resolución de identidad FUERA de la transacción de escritura de eventos
    // (cada findOrCreate ya es su propia transacción withTenant).
    const profileIds: (string | null)[] = [];
    for (const ev of batch.events) {
      if (!ev.identity) {
        profileIds.push(null);
        continue;
      }
      // El email manda; teléfono y wa_id son secundarios (matching determinista).
      const kind = ev.identity.email ? 'EMAIL' : ev.identity.phone ? 'PHONE' : 'WA_ID';
      const value = ev.identity.email ?? ev.identity.phone ?? ev.identity.waId!;
      const profile = await this.profiles.findOrCreateByIdentity(tenantId, kind, value, {
        source: batch.source,
      });
      profileIds.push(profile.id);
    }

    const result = await this.prisma.withTenant(tenantId, (tx) =>
      tx.event.createMany({
        data: batch.events.map((ev, i) => ({
          tenantId,
          profileId: profileIds[i],
          type: ev.type,
          source: batch.source,
          occurredAt: ev.occurredAt ?? new Date(),
          externalId: ev.externalId,
          props: (ev.props as never) ?? undefined,
        })),
        skipDuplicates: true,
      }),
    );

    const deduped = batch.events.length - result.count;
    if (deduped > 0) {
      this.logger.debug(`ingest ${batch.source}: ${deduped} eventos deduplicados`);
    }
    return { accepted: result.count, deduped };
  }
}
