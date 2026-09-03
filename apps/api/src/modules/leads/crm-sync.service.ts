import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { mirrorLeadToClient } from './lead-client-mirror.js';

export interface CrmSyncEvent {
  type: string;
  occurredAt?: Date;
  identity?: { email?: string };
  props?: Record<string, unknown>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Auto-alta de Cliente desde eventos de e-commerce (WooCommerce hoy,
 * cualquier fuente futura que emita `type: 'purchase'`/`'refund'` mañana —
 * este servicio no sabe ni le importa de qué canal viene el evento).
 *
 * Mismo contrato que sus vecinos en el pipeline de ingesta
 * (`LifecycleService.applyEvent`, `PlaybooksService.onEvent`): se llama
 * SIEMPRE que hay un evento nuevo con perfil resuelto, y es este servicio
 * quien decide si el `type` le importa — así `IngestService` no gana ni una
 * línea de lógica de negocio de CRM.
 *
 * Sin dependencias externas (solo Postgres): un evento de e-commerce no debe
 * poder fallar por una llamada de red ajena a esto.
 */
@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onEvent(
    tenantId: string,
    source: string,
    profile: { id: string },
    ev: CrmSyncEvent,
  ): Promise<void> {
    try {
      if (ev.type === 'purchase') await this.onPurchase(tenantId, profile, ev);
      else if (ev.type === 'refund') await this.onRefund(tenantId, source, ev);
    } catch (err) {
      this.logger.warn({ err, tenantId, type: ev.type }, 'crm-sync falló');
    }
  }

  /**
   * Idempotente por construcción, no solo por el dedupe del Event: llamarlo
   * dos veces para el mismo comprador da el mismo estado final.
   */
  private async onPurchase(
    tenantId: string,
    profile: { id: string },
    ev: CrmSyncEvent,
  ): Promise<void> {
    const email = ev.identity?.email;
    if (!email) return; // sin email no hay a quién ligar

    const company = str(ev.props?.company);
    const customerName = str(ev.props?.customerName) ?? email;
    const occurredAt = ev.occurredAt ?? new Date();

    await this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.lead.findFirst({
        where: { email },
        orderBy: { createdAt: 'asc' }, // determinista si hubiera más de uno
      });

      if (!existing) {
        const lead = await tx.lead.create({
          data: {
            tenantId,
            name: customerName,
            email,
            company,
            source: 'woocommerce',
            status: 'CLIENT',
            profileId: profile.id,
            convertedAt: occurredAt,
          },
        });
        const clientId = await mirrorLeadToClient(tx, tenantId, lead);
        await tx.lead.update({ where: { id: lead.id }, data: { clientId } });
        return;
      }

      // Un LOST es una decisión humana — un evento no la pisa.
      if (existing.status === 'LOST') {
        if (!existing.profileId) {
          await tx.lead.update({ where: { id: existing.id }, data: { profileId: profile.id } });
        }
        return;
      }

      const patch: Record<string, unknown> = {};
      if (!existing.profileId) patch.profileId = profile.id;
      if (!existing.company && company) patch.company = company;

      if (existing.status === 'LEAD') {
        patch.status = 'CLIENT';
        if (!existing.convertedAt) patch.convertedAt = occurredAt;
        patch.clientId = await mirrorLeadToClient(tx, tenantId, existing);
      }
      // status === 'CLIENT' ya: solo el patch de profileId/company de arriba.

      if (Object.keys(patch).length > 0) {
        await tx.lead.update({ where: { id: existing.id }, data: patch });
      }
    });
  }

  /**
   * Anota el Event de compra original como reembolsado — no crea Lead ni
   * toca su status (ver razón en el contrato del plugin: no hay forma barata
   * de saber si fue su única compra, y revertir CLIENT→LEAD automáticamente
   * es más disruptivo que una compra mal contada).
   */
  private async onRefund(tenantId: string, source: string, ev: CrmSyncEvent): Promise<void> {
    const orderId = str(ev.props?.orderId);
    if (!orderId) return;
    const refundAmount = ev.props?.amount;

    await this.prisma.withTenant(tenantId, async (tx) => {
      const original = await tx.event.findFirst({
        where: { tenantId, source, externalId: `order:${orderId}` },
      });
      if (!original) return;
      const mergedProps = {
        ...((original.props as Record<string, unknown>) ?? {}),
        refundedAt: (ev.occurredAt ?? new Date()).toISOString(),
        refundAmount,
      };
      await tx.event.update({ where: { id: original.id }, data: { props: mergedProps as never } });
    });
  }
}
