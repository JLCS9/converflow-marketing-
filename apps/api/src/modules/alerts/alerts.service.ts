import { Injectable } from '@nestjs/common';
import { AlertType, AlertSeverity } from '@converflow/db';
import { NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

const STALE_LEAD_DAYS = 14;
const HIGH_SCORE_THRESHOLD = 75;

/** The four rules the engine can raise, each switchable by the tenant. */
export const ALERT_RULES = ['staleLead', 'oppOverdue', 'taskOverdue', 'hotLead'] as const;
export type AlertRuleKey = (typeof ALERT_RULES)[number];

export interface AlertRulesConfig {
  staleLead: { enabled: boolean; days: number };
  oppOverdue: { enabled: boolean };
  taskOverdue: { enabled: boolean };
  hotLead: { enabled: boolean; minScore: number };
}

/**
 * Defaults preserve the previous behaviour: everything on, same thresholds.
 *
 * The engine used to have NO configuration at all — four rules hardcoded, so
 * alerts appeared and disappeared in a tenant's account with no way to opt out.
 * A customer reported exactly that. Note that "Alertas gráficas" is Kit Digital
 * requirement #7, so turning ALL of them off has compliance consequences for the
 * tenant; that is their call to make, not ours to prevent.
 */
export const DEFAULT_ALERT_RULES: AlertRulesConfig = {
  staleLead: { enabled: true, days: STALE_LEAD_DAYS },
  oppOverdue: { enabled: true },
  taskOverdue: { enabled: true },
  hotLead: { enabled: true, minScore: HIGH_SCORE_THRESHOLD },
};

/** Merge a stored config over the defaults, tolerating partial/legacy JSON. */
export function resolveAlertRules(raw: unknown): AlertRulesConfig {
  const c = (raw ?? {}) as Partial<AlertRulesConfig>;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), min), max) : d;
  return {
    staleLead: {
      enabled: bool(c.staleLead?.enabled, true),
      days: num(c.staleLead?.days, STALE_LEAD_DAYS, 1, 365),
    },
    oppOverdue: { enabled: bool(c.oppOverdue?.enabled, true) },
    taskOverdue: { enabled: bool(c.taskOverdue?.enabled, true) },
    hotLead: {
      enabled: bool(c.hotLead?.enabled, true),
      minScore: num(c.hotLead?.minScore, HIGH_SCORE_THRESHOLD, 1, 100),
    },
  };
}

// Severity weight for ordering (CRITICAL first).
const SEVERITY_WEIGHT: Record<AlertSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

interface DesiredAlert {
  key: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  resourceType: string;
  resourceId: string;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate the alert rules against current tenant data and reconcile the
   * persisted `alerts` rows: create newly-triggered alerts, update changed
   * ones, and delete alerts whose underlying condition is resolved. Writes
   * happen only when there's an actual diff, so a steady state is read-only.
   */
  private async recompute(tenantId: string) {
    const rules = resolveAlertRules(
      (
        await this.prisma.bypass((tx) =>
          tx.tenant.findUnique({ where: { id: tenantId }, select: { alertRules: true } }),
        )
      )?.alertRules,
    );
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const staleCutoff = new Date(now.getTime() - rules.staleLead.days * 24 * 60 * 60 * 1000);

      const [staleLeads, dueOpps, overdueTasks, hotLeads, existing] = await Promise.all([
        tx.lead.findMany({
          where: {
            contactedAt: null,
            status: { notIn: ['CONVERTED', 'LOST'] },
            createdAt: { lte: staleCutoff },
          },
          select: { id: true, name: true, company: true, createdAt: true },
        }),
        tx.opportunity.findMany({
          where: {
            status: { in: ['OPEN', 'QUOTED', 'NEGOTIATING'] },
            expectedCloseDate: { not: null, lt: now },
          },
          select: { id: true, name: true, expectedCloseDate: true },
        }),
        tx.task.findMany({
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS'] },
            dueAt: { not: null, lt: now },
          },
          select: { id: true, title: true, dueAt: true },
        }),
        tx.lead.findMany({
          where: { score: { gte: rules.hotLead.minScore }, status: { in: ['NEW', 'CONTACTED'] } },
          select: { id: true, name: true, company: true, score: true },
        }),
        tx.alert.findMany({
          select: { id: true, type: true, resourceId: true, severity: true, title: true, description: true },
        }),
      ]);

      const desired: DesiredAlert[] = [];

      for (const lead of rules.staleLead.enabled ? staleLeads : []) {
        const company = lead.company ? ` (${lead.company})` : '';
        desired.push({
          key: `${AlertType.LEAD_STALE}:${lead.id}`,
          type: AlertType.LEAD_STALE,
          severity: AlertSeverity.WARNING,
          title: `Lead sin contactar (+${rules.staleLead.days} días)`,
          description: `${lead.name}${company} · creado el ${fmtDate(lead.createdAt)} y aún sin contactar`,
          resourceType: 'lead',
          resourceId: lead.id,
        });
      }

      for (const opp of rules.oppOverdue.enabled ? dueOpps : []) {
        desired.push({
          key: `${AlertType.OPPORTUNITY_DUE}:${opp.id}`,
          type: AlertType.OPPORTUNITY_DUE,
          severity: AlertSeverity.CRITICAL,
          title: 'Oportunidad con cierre vencido',
          description: `${opp.name} · cierre previsto el ${fmtDate(opp.expectedCloseDate!)}`,
          resourceType: 'opportunity',
          resourceId: opp.id,
        });
      }

      for (const task of rules.taskOverdue.enabled ? overdueTasks : []) {
        desired.push({
          key: `${AlertType.TASK_OVERDUE}:${task.id}`,
          type: AlertType.TASK_OVERDUE,
          severity: AlertSeverity.WARNING,
          title: 'Tarea vencida',
          description: `${task.title} · vencía el ${fmtDate(task.dueAt!)}`,
          resourceType: 'task',
          resourceId: task.id,
        });
      }

      for (const lead of rules.hotLead.enabled ? hotLeads : []) {
        const company = lead.company ? ` (${lead.company})` : '';
        desired.push({
          key: `${AlertType.HIGH_SCORE_LEAD}:${lead.id}`,
          type: AlertType.HIGH_SCORE_LEAD,
          severity: AlertSeverity.INFO,
          title: 'Lead de alta prioridad',
          description: `${lead.name}${company} · score ${lead.score} — conviene actuar pronto`,
          resourceType: 'lead',
          resourceId: lead.id,
        });
      }

      const existingByKey = new Map(existing.map((a) => [`${a.type}:${a.resourceId}`, a]));
      const desiredKeys = new Set(desired.map((d) => d.key));

      const toCreate = desired.filter((d) => !existingByKey.has(d.key));
      const toDeleteIds = existing
        .filter((a) => !desiredKeys.has(`${a.type}:${a.resourceId}`))
        .map((a) => a.id);
      const toUpdate: {
        id: string;
        severity: AlertSeverity;
        title: string;
        description: string;
      }[] = [];
      for (const d of desired) {
        const e = existingByKey.get(d.key);
        if (
          e &&
          (e.severity !== d.severity || e.title !== d.title || e.description !== d.description)
        ) {
          toUpdate.push({ id: e.id, severity: d.severity, title: d.title, description: d.description });
        }
      }

      if (toDeleteIds.length) {
        await tx.alert.deleteMany({ where: { id: { in: toDeleteIds } } });
      }
      if (toCreate.length) {
        await tx.alert.createMany({
          data: toCreate.map((d) => ({
            tenantId,
            type: d.type,
            severity: d.severity,
            title: d.title,
            description: d.description,
            resourceType: d.resourceType,
            resourceId: d.resourceId,
          })),
        });
      }
      for (const u of toUpdate) {
        await tx.alert.update({
          where: { id: u.id },
          data: { severity: u.severity, title: u.title, description: u.description },
        });
      }
    });
  }

  async list(tenantId: string, opts: { includeDismissed?: boolean } = {}) {
    await this.recompute(tenantId);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const alerts = await tx.alert.findMany({
        where: opts.includeDismissed ? {} : { dismissedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      // CRITICAL → WARNING → INFO, then newest first (stable from the query above).
      return alerts.sort(
        (a, b) => SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity],
      );
    });
  }

  async unreadCount(tenantId: string) {
    await this.recompute(tenantId);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const count = await tx.alert.count({ where: { readAt: null, dismissedAt: null } });
      return { count };
    });
  }

  async markRead(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const alert = await tx.alert.findUnique({ where: { id } });
      if (!alert) throw new NotFoundError('Alerta no encontrada');
      return tx.alert.update({ where: { id }, data: { readAt: alert.readAt ?? new Date() } });
    });
  }

  async markAllRead(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const res = await tx.alert.updateMany({
        where: { readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: res.count };
    });
  }

  async dismiss(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const alert = await tx.alert.findUnique({ where: { id } });
      if (!alert) throw new NotFoundError('Alerta no encontrada');
      const now = new Date();
      return tx.alert.update({
        where: { id },
        data: { dismissedAt: now, readAt: alert.readAt ?? now },
      });
    });
  }
}
