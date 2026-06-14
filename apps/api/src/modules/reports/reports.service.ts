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

const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 14; // 7-day sparkline + the prior 7 days for week-over-week deltas
const TZ = 'Europe/Madrid';

// Calendar-day key (YYYY-MM-DD) in the business timezone. 'en-CA' yields ISO.
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function dayKey(d: Date): string {
  return dayKeyFmt.format(d);
}

// Ascending list of the last `count` calendar-day keys ending today (TZ-aware).
// We anchor on today's Madrid key and walk back over plain calendar dates using
// UTC-noon math, which is immune to DST drift (unlike subtracting 24h from a Date).
function lastDayKeys(now: Date, count: number): string[] {
  const [y, m, d] = dayKey(now).split('-').map(Number);
  const anchor = Date.UTC(y!, m! - 1, d!, 12);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(dayKey(new Date(anchor - i * DAY_MS)));
  }
  return keys;
}

interface Action {
  name?: string;
}
function actionsOf(metadata: unknown): Action[] {
  const actions = (metadata as { actions?: unknown } | null)?.actions;
  return Array.isArray(actions) ? (actions as Action[]) : [];
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

  /**
   * Time series for the Hoy home: daily buckets over the last 14 calendar days
   * (TZ-aware) for the metrics that have a real event timestamp, plus
   * week-over-week deltas (last 7 days vs the prior 7) and a 7-day AI activity
   * summary derived from `ai_usage`. Point-in-time metrics (open pipeline, tasks
   * overdue) are intentionally NOT here — we don't fabricate history we lack.
   */
  series(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const keys = lastDayKeys(now, SERIES_DAYS);
      const keyIndex = new Map(keys.map((k, i) => [k, i]));
      // Generous UTC lower bound (covers the 14-day window plus tz slack); we
      // bucket precisely by Madrid day key afterwards and drop anything older.
      const since = new Date(now.getTime() - (SERIES_DAYS + 1) * DAY_MS);
      const aiSince = new Date(now.getTime() - 7 * DAY_MS);

      const [leadsCreated, conversions, won, inbound, aiRows] = await Promise.all([
        tx.lead.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        tx.lead.findMany({
          where: { convertedAt: { gte: since } },
          select: { convertedAt: true },
        }),
        tx.opportunity.findMany({
          where: { status: 'WON', closedAt: { gte: since } },
          select: { closedAt: true, amount: true },
        }),
        tx.message.findMany({
          where: { direction: 'IN', createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        tx.aiUsage.findMany({
          where: { createdAt: { gte: aiSince } },
          select: { feature: true, status: true, metadata: true },
        }),
      ]);

      const zeros = () => keys.map(() => 0);
      const counts = {
        leadsCreated: zeros(),
        conversions: zeros(),
        wonCount: zeros(),
        wonValue: zeros(),
        inboundMessages: zeros(),
      };
      const bump = (series: number[], at: Date | null, amount = 1) => {
        if (!at) return;
        const i = keyIndex.get(dayKey(at));
        if (i !== undefined) series[i]! += amount;
      };

      for (const r of leadsCreated) bump(counts.leadsCreated, r.createdAt);
      for (const r of conversions) bump(counts.conversions, r.convertedAt);
      for (const r of inbound) bump(counts.inboundMessages, r.createdAt);
      for (const r of won) {
        bump(counts.wonCount, r.closedAt);
        bump(counts.wonValue, r.closedAt, toNumber(r.amount));
      }

      // Week-over-week: sum of the last 7 buckets vs the 7 before them.
      const half = SERIES_DAYS / 2;
      const sum = (arr: number[], from: number, to: number) =>
        arr.slice(from, to).reduce((a, b) => a + b, 0);
      const delta = (arr: number[]) => {
        const current = sum(arr, half, SERIES_DAYS);
        const previous = sum(arr, 0, half);
        return {
          current,
          previous,
          // null when there's no prior baseline — the UI shows "nuevo" rather
          // than a misleading +100%.
          pct: previous > 0 ? (current - previous) / previous : null,
        };
      };

      // AI activity over the last 7 days.
      const ai = { attended: 0, suggestions: 0, leadsScored: 0, meetings: 0, escalations: 0 };
      for (const row of aiRows) {
        if (row.feature === 'lead_scoring' || row.feature === 'lead_scoring_batch') {
          ai.leadsScored += 1;
        }
        if (row.feature !== 'agent_reply' || row.status !== 'OK') continue;
        const meta = row.metadata as { mode?: string; delivered?: boolean } | null;
        if (meta?.mode === 'OFF') continue;
        if (meta?.delivered) ai.attended += 1;
        else ai.suggestions += 1;
        for (const a of actionsOf(row.metadata)) {
          if (a.name === 'schedule_meeting') ai.meetings += 1;
          else if (a.name === 'escalate_to_human') ai.escalations += 1;
        }
      }
      const handled = ai.attended + ai.suggestions;

      return {
        days: keys,
        series: {
          leadsCreated: counts.leadsCreated,
          conversions: counts.conversions,
          wonCount: counts.wonCount,
          wonValue: counts.wonValue,
          inboundMessages: counts.inboundMessages,
        },
        deltas: {
          leadsCreated: delta(counts.leadsCreated),
          conversions: delta(counts.conversions),
          wonValue: delta(counts.wonValue),
          inboundMessages: delta(counts.inboundMessages),
        },
        aiWeek: {
          ...ai,
          handled,
          // share of handled conversations the AI resolved without a human reply
          autoResolvedPct: handled > 0 ? ai.attended / handled : null,
        },
      };
    });
  }
}
