/**
 * Backfill de Oportunidades para compras de e-commerce ya registradas ANTES
 * de que existiera `PurchaseOpportunityService` (ver ese fichero para el
 * flujo en vivo). Recorre los eventos de compra (`Event.type='purchase'`)
 * que no tengan todavía su Oportunidad ganada y la crea — con la fecha REAL
 * del pedido (no la de hoy), para que el histórico sea correcto desde el
 * primer día en cualquier filtro por fecha del panel de Oportunidades.
 *
 * Reutiliza el MISMO cálculo de nombre de producto (`opportunityName`) y de
 * etapa ganadora (`resolveStageForStatus`/`syncStatusFromStage`) que usa el
 * flujo en vivo, requeridos directamente del `dist` compilado — cero reglas
 * de negocio reimplementadas aquí; solo se reescribe la orquestación de
 * consultas (mismo patrón que el resto de scripts de migración del repo,
 * ver migrate-mailboxes.cjs — sin bootstrap de Nest, Prisma directo).
 *
 * Idempotente: el `@@unique([tenantId, source, externalId])` de Opportunity
 * hace que una segunda pasada no duplique nada; por eso, además, este script
 * comprueba primero qué pedidos ya tienen Oportunidad antes de crear nada.
 *
 * Requiere el dist compilado (`pnpm --filter @converflow/api build`, ya lo
 * hace el propio deploy). Por defecto solo SIMULA; hay que pasar --apply
 * para escribir.
 *
 *   node apps/api/scripts/backfill-purchase-opportunities.cjs            → simula
 *   node apps/api/scripts/backfill-purchase-opportunities.cjs --apply    → escribe
 */
const path = require('node:path');
const { prisma, withRlsBypass } = require('@converflow/db');

const distPath = path.join(__dirname, '..', 'dist');
const { resolveStageForStatus, syncStatusFromStage } = require(
  path.join(distPath, 'modules', 'pipelines', 'pipelines.service.js'),
);
const { opportunityName } = require(
  path.join(distPath, 'modules', 'opportunities', 'purchase-opportunity.service.js'),
);

const APPLY = process.argv.includes('--apply');

async function main() {
  const purchases = await withRlsBypass(prisma, (tx) =>
    tx.event.findMany({
      where: { type: 'purchase' },
      orderBy: { occurredAt: 'asc' },
      select: { id: true, tenantId: true, source: true, occurredAt: true, props: true, profileId: true },
    }),
  );

  if (!purchases.length) {
    console.info('No hay eventos de compra registrados. Nada que rellenar.');
    await prisma.$disconnect();
    return;
  }

  const existingOpps = await withRlsBypass(prisma, (tx) =>
    tx.opportunity.findMany({
      where: { externalId: { not: null } },
      select: { tenantId: true, source: true, externalId: true },
    }),
  );
  const already = new Set(existingOpps.map((o) => `${o.tenantId}:${o.source}:${o.externalId}`));

  // Pipeline por defecto, una consulta por tenant (cacheado — muchos eventos
  // comparten tenant).
  const pipelineByTenant = new Map();
  async function defaultPipeline(tenantId) {
    if (pipelineByTenant.has(tenantId)) return pipelineByTenant.get(tenantId);
    const p = await withRlsBypass(prisma, async (tx) => {
      const preferred = await tx.pipeline.findFirst({
        where: { tenantId, entityType: 'OPPORTUNITY', isDefault: true, archivedAt: null },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
      if (preferred) return preferred;
      return tx.pipeline.findFirst({
        where: { tenantId, entityType: 'OPPORTUNITY', archivedAt: null },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
    });
    pipelineByTenant.set(tenantId, p);
    return p;
  }

  console.info(APPLY ? '=== RELLENANDO OPORTUNIDADES ===\n' : '=== SIMULACION (usa --apply para escribir) ===\n');
  let created = 0;
  let skippedExisting = 0;
  let skippedNoOrderId = 0;
  let skippedNoLead = 0;

  for (const ev of purchases) {
    const props = ev.props || {};
    const orderId = typeof props.orderId === 'string' ? props.orderId.trim() : '';
    if (!orderId) {
      skippedNoOrderId++;
      continue;
    }
    const externalId = `order:${orderId}`;
    const key = `${ev.tenantId}:${ev.source}:${externalId}`;
    if (already.has(key)) {
      skippedExisting++;
      continue;
    }

    const lead = ev.profileId
      ? await withRlsBypass(prisma, (tx) =>
          tx.lead.findFirst({
            where: { tenantId: ev.tenantId, profileId: ev.profileId },
            select: { id: true, clientId: true },
          }),
        )
      : null;
    if (!lead) {
      skippedNoLead++;
      continue;
    }

    const pipeline = await defaultPipeline(ev.tenantId);
    const stage = resolveStageForStatus(pipeline, 'WON');
    const status = stage ? syncStatusFromStage(stage, 'WON') : 'WON';
    const name = opportunityName(props);
    const when = ev.occurredAt.toISOString().slice(0, 10);

    console.info(
      `  CREAR   ${ev.tenantId}  ${name}  (${when}, ${props.amount ?? '?'} ${props.currency ?? ''}, pedido ${orderId})`,
    );

    if (APPLY) {
      await withRlsBypass(prisma, async (tx) => {
        const opp = await tx.opportunity.create({
          data: {
            tenantId: ev.tenantId,
            name,
            leadId: lead.id,
            clientId: lead.clientId,
            amount: typeof props.amount === 'string' ? props.amount : undefined,
            currency: typeof props.currency === 'string' ? props.currency : 'EUR',
            status,
            source: ev.source,
            externalId,
            pipelineId: pipeline?.id,
            stageId: stage?.id,
            createdAt: ev.occurredAt,
            closedAt: ev.occurredAt,
          },
        });
        if (stage) {
          await tx.opportunityStageHistory.create({
            data: { tenantId: ev.tenantId, opportunityId: opp.id, stageId: stage.id },
          });
        }
      });
      already.add(key); // por si el mismo pedido aparece dos veces en el batch (no debería, pero por seguridad)
    }
    created++;
  }

  console.info(
    `\n${APPLY ? 'Creadas' : 'Se crearían'}: ${created}   ` +
      `Ya existían: ${skippedExisting}   Sin id de pedido: ${skippedNoOrderId}   Sin Lead: ${skippedNoLead}`,
  );
  if (!APPLY && created > 0) {
    console.info('Nada escrito. Repite con --apply cuando lo veas bien.');
  }
  if (APPLY && created > 0) {
    console.info('\nComprueba en Oportunidades que aparecen en la columna "Ganado" con la fecha real del pedido.');
  }
  await prisma.$disconnect();
}

void main();
