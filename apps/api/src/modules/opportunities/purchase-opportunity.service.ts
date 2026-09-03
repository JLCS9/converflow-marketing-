import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { PipelinesService, resolveStageForStatus, syncStatusFromStage } from '../pipelines/pipelines.service.js';

export interface PurchaseOpportunityEvent {
  type: string;
  occurredAt?: Date;
  props?: Record<string, unknown>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

interface LineItem {
  name?: unknown;
}

function lineItemsOf(props: Record<string, unknown> | undefined): LineItem[] {
  const raw = props?.lineItems;
  return Array.isArray(raw) ? raw.filter((x): x is LineItem => typeof x === 'object' && x !== null) : [];
}

/**
 * Nombre de la Oportunidad a partir de los productos comprados — nunca un
 * id técnico. Un producto → su nombre; varios → el primero + "N más" (evita
 * tarjetas de kanban con listas larguísimas). Pedido sin líneas (payload
 * viejo/roto) → cae al nombre del pedido, y en último caso a "Compra".
 * Exportada (no solo interna) para que el script de backfill
 * (`scripts/backfill-purchase-opportunities.cjs`) derive el nombre con
 * exactamente la misma regla que el flujo en vivo, sin reimplementarla.
 */
export function opportunityName(props: Record<string, unknown> | undefined): string {
  const names = lineItemsOf(props)
    .map((i) => str(i.name))
    .filter((n): n is string => !!n);
  if (names.length === 1) return names[0]!;
  if (names.length > 1) return `${names[0]} +${names.length - 1} más`;
  return str(props?.name) ?? 'Compra';
}

/**
 * Compra de e-commerce → Oportunidad ganada del pipeline comercial (una por
 * PEDIDO, no por línea de producto — decisión de producto: un pedido es una
 * venta). Mismo contrato que sus vecinos en el pipeline de ingesta
 * (`CrmSyncService`, `LifecycleService`): `onEvent` se llama siempre que hay
 * un evento nuevo con perfil resuelto, y es este servicio quien decide si el
 * `type` le importa.
 *
 * Independiente de `CrmSyncService` a propósito (no recibe nada de él por
 * parámetro): resuelve el Lead por `profileId`, que `CrmSyncService` ya
 * enlazó al procesar el mismo evento justo antes — mismo principio de
 * servicios de efecto-secundario desacoplados que ya usa todo el pipeline.
 *
 * El mismo método `onEvent` lo reutiliza el script de backfill
 * (`apps/api/scripts/backfill-purchase-opportunities.cjs`) para las compras
 * que ya estaban registradas antes de que este servicio existiera — cero
 * lógica duplicada entre el flujo en caliente y el histórico.
 */
@Injectable()
export class PurchaseOpportunityService {
  private readonly logger = new Logger(PurchaseOpportunityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelines: PipelinesService,
  ) {}

  async onEvent(
    tenantId: string,
    source: string,
    profile: { id: string },
    ev: PurchaseOpportunityEvent,
  ): Promise<void> {
    try {
      if (ev.type === 'purchase') await this.onPurchase(tenantId, source, profile, ev);
      else if (ev.type === 'refund') await this.onRefund(tenantId, source, ev);
    } catch (err) {
      this.logger.warn({ err, tenantId, type: ev.type }, 'purchase-opportunity falló');
    }
  }

  /** Idempotente por construcción (no solo por el `@@unique` de BD): un
   *  reintento de webhook o una segunda pasada del backfill no duplica
   *  nada — se comprueba ANTES de gastar ninguna otra query. */
  private async onPurchase(
    tenantId: string,
    source: string,
    profile: { id: string },
    ev: PurchaseOpportunityEvent,
  ): Promise<void> {
    const orderId = str(ev.props?.orderId);
    if (!orderId) return;
    const externalId = `order:${orderId}`;
    const occurredAt = ev.occurredAt ?? new Date();

    const already = await this.prisma.withTenant(tenantId, (tx) =>
      tx.opportunity.findUnique({
        where: { tenantId_source_externalId: { tenantId, source, externalId } },
        select: { id: true },
      }),
    );
    if (already) return;

    // El comprador ya tiene Lead — lo creó/enlazó CrmSyncService al procesar
    // este mismo evento justo antes. Sin Lead no hay a quién ligar la venta.
    const lead = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findFirst({ where: { profileId: profile.id }, select: { id: true, clientId: true } }),
    );
    if (!lead) return;

    const pipeline = await this.pipelines.getDefault(tenantId);
    const stage = resolveStageForStatus(pipeline, 'WON');
    const status = stage ? syncStatusFromStage(stage, 'WON') : 'WON';

    await this.prisma.withTenant(tenantId, async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          tenantId,
          name: opportunityName(ev.props),
          leadId: lead.id,
          clientId: lead.clientId,
          amount: str(ev.props?.amount),
          currency: str(ev.props?.currency) ?? 'EUR',
          status,
          source,
          externalId,
          pipelineId: pipeline?.id,
          stageId: stage?.id,
          // Fecha REAL del pedido, nunca "ahora" — imprescindible tanto en
          // vivo como (sobre todo) en el backfill: si no, todo el histórico
          // aparecería "creado hoy" y rompería cualquier filtro por fecha.
          createdAt: occurredAt,
          closedAt: occurredAt,
        },
      });
      if (stage) {
        await tx.opportunityStageHistory.create({
          data: { tenantId, opportunityId: created.id, stageId: stage.id },
        });
      }
    });
  }

  /**
   * Anota la Oportunidad con una nota visible del reembolso — NO revierte
   * `status: WON→LOST` automáticamente, mismo principio conservador que
   * `CrmSyncService.onRefund` aplica al Lead: no hay forma barata de saber
   * si fue la única compra, y una reversión de estado sola es más
   * disruptiva que dejarlo para que una persona lo revise.
   */
  private async onRefund(tenantId: string, source: string, ev: PurchaseOpportunityEvent): Promise<void> {
    const orderId = str(ev.props?.orderId);
    if (!orderId) return;
    const externalId = `order:${orderId}`;
    const amount = str(ev.props?.amount);
    const when = (ev.occurredAt ?? new Date()).toLocaleDateString('es-ES');

    await this.prisma.withTenant(tenantId, async (tx) => {
      const opp = await tx.opportunity.findUnique({
        where: { tenantId_source_externalId: { tenantId, source, externalId } },
        select: { id: true, currency: true },
      });
      if (!opp) return;
      await tx.note.create({
        data: {
          tenantId,
          opportunityId: opp.id,
          authorId: 'system',
          body: amount
            ? `Reembolso registrado el ${when}: -${amount} ${opp.currency} (WooCommerce).`
            : `Reembolso registrado el ${when} (WooCommerce).`,
        },
      });
    });
  }
}
