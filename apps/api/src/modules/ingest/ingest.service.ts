import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eventBatchSchema, type EventBatchInput } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { LifecycleService } from '../lifecycle/lifecycle.service.js';
import { PlaybooksService } from '../playbooks/playbooks.service.js';
import { AiReportsService } from '../ai-reports/ai-reports.service.js';
import { CrmSyncService } from '../leads/crm-sync.service.js';
import { RagService } from '../rag/rag.service.js';
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
    private readonly rag: RagService,
    private readonly playbooks: PlaybooksService,
    private readonly reports: AiReportsService,
    private readonly crmSync: CrmSyncService,
  ) {}

  onModuleInit() {
    this.queue.registerProcessor(async (job) => {
      const data = job.data as IngestJob;
      if (data.kind === 'ingest-batch') {
        await this.processBatch(data.tenantId, data.batch);
      } else if (data.kind === 'embed') {
        const res = await this.rag.embedPending(data.tenantId);
        if (res.embedded) this.logger.log(`embed ${data.tenantId}: ${res.embedded} fragmentos`);
      } else if (data.kind === 'monthly-report') {
        // El día 1 se informa del mes que ACABA de terminar.
        const prev = new Date();
        prev.setUTCDate(0); // último día del mes anterior
        const month = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
        await this.reports.generate(data.tenantId, month);
      } else if (data.kind === 'report-poll') {
        await this.reports.pollPendingNarratives();
      } else {
        {
          const res = await this.lifecycle.sweep(data.tenantId);
          for (const t of res.transitions) {
            void this.playbooks
              .onTransition(data.tenantId, t.profileId, t.to)
              .catch((err) => this.logger.warn(`playbook onTransition falló: ${err.message}`));
          }
          // F4 · Con la misma cadencia diaria: medir resultados de seguimientos.
          await this.playbooks
            .sweepOutcomes(data.tenantId)
            .catch((err) => this.logger.warn(`playbook outcomes falló: ${err.message}`));
        }
      }
    });
    // Barrido diario por tenant activo (idempotente: jobId fijo por tenant).
    void this.scheduleSweeps().catch((err) =>
      this.logger.warn(`no se pudieron programar los barridos: ${err.message}`),
    );
    void this.queue.scheduleReportPoll().catch((err) =>
      this.logger.warn(`no se pudo programar el poll de informes: ${err.message}`),
    );
  }

  private async scheduleSweeps() {
    const tenants = await this.prisma.bypass((tx) =>
      tx.tenant.findMany({
        where: { status: { in: ['TRIAL', 'ACTIVE'] } },
        select: { id: true },
      }),
    );
    for (const t of tenants) {
      await this.queue.scheduleSweep(t.id);
      await this.queue.scheduleMonthlyReport(t.id);
    }
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

      // Contador visible en Ajustes → Integraciones: cuenta pedidos NUEVOS
      // (los reintentos deduplicados arriba nunca llegan aquí). No-op
      // silencioso si `batch.source` no es el id de un IngestSource con
      // EcommerceConnection asociada (canales que no son e-commerce).
      if (ev.type === 'purchase') {
        await this.prisma
          .withTenant(tenantId, (tx) =>
            tx.ecommerceConnection.updateMany({
              where: { ingestSourceId: batch.source },
              data: { ordersImported: { increment: 1 }, lastSyncedAt: new Date() },
            }),
          )
          .catch((err) => this.logger.warn(`contador de pedidos importados falló: ${err.message}`));
      }

      // 3. Ciclo de vida: solo los eventos NUEVOS transicionan estados.
      if (profile) {
        const newState = await this.lifecycle
          .applyEvent(tenantId, profile.id, ev.type)
          .catch((err) => {
            this.logger.warn(`lifecycle applyEvent falló: ${err.message}`);
            return null;
          });
        // F3 · Playbooks: el evento y la transición (si la hubo) disparan
        // acciones declarativas. Fire-and-forget: la ingesta nunca espera.
        void this.playbooks
          .onEvent(tenantId, profile.id, ev.type)
          .catch((err) => this.logger.warn(`playbook onEvent falló: ${err.message}`));
        if (newState) {
          void this.playbooks
            .onTransition(tenantId, profile.id, newState)
            .catch((err) => this.logger.warn(`playbook onTransition falló: ${err.message}`));
        }
        // Auto-alta/promoción de Cliente desde compras de e-commerce
        // (cualquier fuente que emita 'purchase'/'refund', no solo
        // WooCommerce). CrmSyncService decide internamente si el `type` le
        // importa — este servicio no gana lógica de negocio de CRM.
        await this.crmSync
          .onEvent(tenantId, batch.source, profile, ev)
          .catch((err) => this.logger.warn(`crm-sync falló: ${err.message}`));
      }
    }

    if (deduped) this.logger.debug(`ingest ${batch.source}: ${deduped} duplicados ignorados`);
    return { accepted, deduped };
  }
}
