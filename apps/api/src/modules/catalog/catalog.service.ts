import { Injectable } from '@nestjs/common';
import type { CatalogItemInput } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/**
 * Catálogo sincronizado (productos, cursos, servicios — cualquier vertical).
 * Deliberadamente FUERA del pipe de `Event`: ese pipe es append-only (dedupe
 * por `externalId`), mientras que un producto cambia de precio/disponibilidad
 * con el tiempo y necesita upsert, no un log de altas. Sin resolución de
 * identidad ni disparo de lifecycle/playbooks — es una tabla de referencia,
 * no un evento de comportamiento.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Un producto borrado en el origen se manda con `available: false`
   *  (soft-delete) — nunca se borra físicamente por sincronización. */
  async upsertBatch(
    tenantId: string,
    source: string,
    items: CatalogItemInput[],
  ): Promise<{ upserted: number }> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      for (const item of items) {
        await tx.catalogItem.upsert({
          where: { tenantId_source_externalId: { tenantId, source, externalId: item.externalId } },
          create: {
            tenantId,
            source,
            externalId: item.externalId,
            kind: item.kind,
            name: item.name,
            description: item.description,
            url: item.url,
            price: item.price,
            currency: item.currency,
            available: item.available,
            meta: (item.meta as never) ?? undefined,
          },
          update: {
            kind: item.kind,
            name: item.name,
            description: item.description,
            url: item.url,
            price: item.price,
            currency: item.currency,
            available: item.available,
            meta: (item.meta as never) ?? undefined,
          },
        });
      }
    });
    return { upserted: items.length };
  }
}
