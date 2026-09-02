import { Injectable, Logger } from '@nestjs/common';
import { BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';

export interface MonthlyMetrics {
  month: string;
  engine: {
    /** Turnos totales respondidos por el motor. */
    turns: number;
    /** Turnos resueltos sin humano (canAnswer=true). */
    resolved: number;
    /** Tasa de resolución sin humano (0-1). */
    resolutionRate: number | null;
  };
  gaps: { opened: number; covered: number; dismissed: number; openAtEnd: number };
  verified: { created: number; fromCorrections: number };
  consents: { granted: number; revoked: number };
  playbooks: { sent: number; replied: number; suppressed: number };
  lifecycle: Record<string, number>;
  ai: { costUsd: number; calls: number };
}

function monthRange(month: string): { from: Date; to: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestError('Mes inválido (YYYY-MM)');
  const [y, m] = month.split('-').map(Number);
  if (m! < 1 || m! > 12) throw new BadRequestError('Mes inválido (YYYY-MM)');
  return { from: new Date(Date.UTC(y!, m! - 1, 1)), to: new Date(Date.UTC(y!, m!, 1)) };
}

/**
 * F4 · Informe mensual del piloto: métricas deterministas por SQL y una
 * narrativa breve redactada vía Batch API (mitad de coste; un informe no
 * tiene prisa). La curva de mejora sale de comparar meses consecutivos.
 */
@Injectable()
export class AiReportsService {
  private readonly logger = new Logger(AiReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ---- métricas -----------------------------------------------------------------

  async computeMetrics(tenantId: string, month: string): Promise<MonthlyMetrics> {
    const { from, to } = monthRange(month);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const range = { gte: from, lt: to };

      const engineUsage = await tx.aiUsage.findMany({
        where: { feature: 'conversation_engine', createdAt: range },
        select: { metadata: true },
      });
      const resolved = engineUsage.filter(
        (u) => (u.metadata as { canAnswer?: boolean } | null)?.canAnswer === true,
      ).length;

      const [gapsOpened, gapsCovered, gapsDismissed, gapsOpenAtEnd] = await Promise.all([
        tx.knowledgeGap.count({ where: { createdAt: range } }),
        tx.knowledgeGap.count({ where: { status: 'COVERED', updatedAt: range } }),
        tx.knowledgeGap.count({ where: { status: 'DISMISSED', updatedAt: range } }),
        tx.knowledgeGap.count({ where: { status: 'OPEN', createdAt: { lt: to } } }),
      ]);

      const verifiedRows = await tx.verifiedAnswer.findMany({
        where: { createdAt: range },
        select: { meta: true },
      });
      const fromCorrections = verifiedRows.filter(
        (v) => (v.meta as { source?: string } | null)?.source === 'human_correction',
      ).length;

      const [consentsGranted, consentsRevoked] = await Promise.all([
        tx.consent.count({ where: { granted: true, createdAt: range } }),
        tx.consent.count({ where: { revokedAt: range } }),
      ]);

      const runRows = await tx.playbookRun.findMany({
        where: { createdAt: range },
        select: { status: true, meta: true },
      });
      const sent = runRows.filter((r) => r.status === 'SENT').length;
      const replied = runRows.filter(
        (r) => (r.meta as { outcome?: string } | null)?.outcome === 'replied',
      ).length;
      const suppressed = runRows.filter((r) => r.status === 'SUPPRESSED').length;

      const transitions = await tx.lifecycleState.groupBy({
        by: ['state'],
        where: { createdAt: range },
        _count: { state: true },
      });

      const cost = await tx.aiUsage.aggregate({
        where: { createdAt: range },
        _sum: { costUsd: true },
        _count: { id: true },
      });

      return {
        month,
        engine: {
          turns: engineUsage.length,
          resolved,
          resolutionRate: engineUsage.length ? resolved / engineUsage.length : null,
        },
        gaps: { opened: gapsOpened, covered: gapsCovered, dismissed: gapsDismissed, openAtEnd: gapsOpenAtEnd },
        verified: { created: verifiedRows.length, fromCorrections },
        consents: { granted: consentsGranted, revoked: consentsRevoked },
        playbooks: { sent, replied, suppressed },
        lifecycle: Object.fromEntries(transitions.map((t) => [t.state, t._count.state])),
        ai: { costUsd: Math.round((cost._sum.costUsd ?? 0) * 100) / 100, calls: cost._count.id },
      };
    });
  }

  // ---- generación ------------------------------------------------------------------

  /** Calcula y guarda las métricas del mes; encola la narrativa en batch. */
  async generate(tenantId: string, month: string) {
    const metrics = await this.computeMetrics(tenantId, month);
    const previous = await this.prisma.withTenant(tenantId, (tx) =>
      tx.monthlyReport.findFirst({
        where: { month: { lt: month } },
        orderBy: { month: 'desc' },
        select: { month: true, metrics: true },
      }),
    );

    const report = await this.prisma.withTenant(tenantId, (tx) =>
      tx.monthlyReport.upsert({
        where: { tenantId_month: { tenantId, month } },
        create: { tenantId, month, metrics: metrics as never },
        update: { metrics: metrics as never, narrative: null, batchId: null },
      }),
    );

    // Narrativa vía Batch API: sin prisa y a mitad de coste.
    try {
      const batchId = await this.ai.batchCreate([
        {
          customId: `report-${report.id}`,
          model: this.ai.modelFor('summarize'),
          system:
            'Redactas el informe mensual del asistente de IA de un negocio, para su dueño (no técnico). ' +
            'SOLO datos de las métricas: nada inventado. Tono claro y directo, en castellano. ' +
            'Estructura: qué mejoró, qué empeoró, y 2-3 acciones concretas recomendadas. Máximo 200 palabras.',
          userPrompt:
            `MÉTRICAS DE ${month}:\n${JSON.stringify(metrics, null, 2)}\n\n` +
            (previous
              ? `MES ANTERIOR (${previous.month}) PARA COMPARAR:\n${JSON.stringify(previous.metrics, null, 2)}`
              : '(sin mes anterior: es el primer informe)'),
          maxTokens: 500,
        },
      ]);
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.monthlyReport.update({ where: { id: report.id }, data: { batchId } }),
      );
    } catch (err) {
      // Sin narrativa no se bloquea nada: las métricas ya están guardadas.
      this.logger.warn({ err, tenantId, month }, 'batch de narrativa no enviado');
    }

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.monthlyReport.findUnique({ where: { id: report.id } }),
    );
  }

  /** Recoge narrativas de batches terminados (job periódico, cross-tenant). */
  async pollPendingNarratives() {
    const pending = await this.prisma.bypass((tx) =>
      tx.monthlyReport.findMany({
        where: { batchId: { not: null }, narrative: null },
        select: { id: true, tenantId: true, batchId: true },
        take: 50,
      }),
    );
    if (!pending.length) return { collected: 0 };

    let collected = 0;
    // Un batch puede agrupar varios informes: agrupar por batchId.
    const byBatch = new Map<string, typeof pending>();
    for (const p of pending) {
      const list = byBatch.get(p.batchId!) ?? [];
      list.push(p);
      byBatch.set(p.batchId!, list);
    }
    for (const [batchId, reports] of byBatch) {
      const results = await this.ai.batchResults(batchId).catch(() => null);
      if (!results) continue; // sigue en curso
      for (const r of reports) {
        const text = results.get(`report-${r.id}`);
        await this.prisma.withTenant(r.tenantId, (tx) =>
          tx.monthlyReport.update({
            where: { id: r.id },
            // Batch fallido → narrativa vacía pero salimos del bucle de poll.
            data: { narrative: text ?? '', batchId: null },
          }),
        );
        if (text) collected++;
      }
    }
    if (collected) this.logger.log(`informes: ${collected} narrativas recogidas`);
    return { collected };
  }

  // ---- lectura -------------------------------------------------------------------

  list(tenantId: string, limit = 12) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.monthlyReport.findMany({
        orderBy: { month: 'desc' },
        take: limit,
        select: { id: true, month: true, metrics: true, narrative: true, createdAt: true, updatedAt: true },
      }),
    );
  }
}
