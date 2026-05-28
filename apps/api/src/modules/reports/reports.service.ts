import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'] as const;
const OPP_STAGES = ['OPEN', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST'] as const;
const OPEN_OPP_STAGES = ['OPEN', 'QUOTED', 'NEGOTIATING'] as const;

function toNumber(value: unknown): number {
  if (value == null) return 0;
  // Prisma Decimal exposes toNumber(); fall back to Number() for plain values.
  const dec = value as { toNumber?: () => number };
  return typeof dec.toNumber === 'function' ? dec.toNumber() : Number(value);
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  overview(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();

      const [
        leadsByStatus,
        leadsBySourceRaw,
        oppsByStage,
        openOpps,
        tasksPending,
        tasksOverdue,
        tasksDone,
        clientsTotal,
        clientsActive,
      ] = await Promise.all([
        tx.lead.groupBy({ by: ['status'], _count: { _all: true } }),
        tx.lead.groupBy({ by: ['source'], _count: { _all: true } }),
        tx.opportunity.groupBy({
          by: ['status'],
          _count: { _all: true },
          _sum: { amount: true },
        }),
        tx.opportunity.findMany({
          where: { status: { in: [...OPEN_OPP_STAGES] }, amount: { not: null } },
          select: { amount: true, expectedCloseDate: true },
        }),
        tx.task.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
        tx.task.count({
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS'] },
            dueAt: { not: null, lt: now },
          },
        }),
        tx.task.count({ where: { status: 'DONE' } }),
        tx.client.count(),
        tx.client.count({ where: { status: 'ACTIVE' } }),
      ]);

      const statusCounts = new Map(leadsByStatus.map((r) => [r.status, r._count._all]));
      const byStatus = LEAD_STATUSES.map((status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
      }));
      const totalLeads = byStatus.reduce((sum, r) => sum + r.count, 0);
      const convertedLeads = statusCounts.get('CONVERTED') ?? 0;

      const bySource = leadsBySourceRaw
        .map((r) => ({ source: r.source ?? 'desconocida', count: r._count._all }))
        .sort((a, b) => b.count - a.count);

      const stageCounts = new Map(oppsByStage.map((r) => [r.status, r]));
      const byStage = OPP_STAGES.map((status) => {
        const row = stageCounts.get(status);
        return {
          status,
          count: row?._count._all ?? 0,
          value: toNumber(row?._sum.amount),
        };
      });
      const openValue = byStage
        .filter((s) => (OPEN_OPP_STAGES as readonly string[]).includes(s.status))
        .reduce((sum, s) => sum + s.value, 0);
      const wonValue = byStage.find((s) => s.status === 'WON')?.value ?? 0;

      // Bucket open pipeline by expected-close month (YYYY-MM), in JS.
      const monthMap = new Map<string, { value: number; count: number }>();
      for (const opp of openOpps) {
        if (!opp.expectedCloseDate) continue;
        const month = opp.expectedCloseDate.toISOString().slice(0, 7);
        const bucket = monthMap.get(month) ?? { value: 0, count: 0 };
        bucket.value += toNumber(opp.amount);
        bucket.count += 1;
        monthMap.set(month, bucket);
      }
      const pipelineByMonth = [...monthMap.entries()]
        .map(([month, b]) => ({ month, value: b.value, count: b.count }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return {
        leads: {
          total: totalLeads,
          byStatus,
          bySource,
          conversionRate: totalLeads > 0 ? convertedLeads / totalLeads : 0,
        },
        opportunities: {
          byStage,
          openValue,
          wonValue,
          pipelineByMonth,
        },
        tasks: {
          pending: tasksPending,
          overdue: tasksOverdue,
          done: tasksDone,
        },
        clients: {
          total: clientsTotal,
          active: clientsActive,
        },
      };
    });
  }
}
