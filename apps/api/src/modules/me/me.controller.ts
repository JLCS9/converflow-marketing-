import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiBudgetService } from '../../common/ai/ai-budget.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { resolveAlertRules } from '../alerts/alerts.service.js';

const WIDGET_SIZES = new Set(['sm', 'md', 'lg']);

/** Validate/normalize a dashboard widget list to [{id, size}]. Accepts legacy string[]. */
function normalizeWidgets(raw: unknown): { id: string; size: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const out: { id: string; size: string }[] = [];
  for (const w of raw.slice(0, 50)) {
    if (typeof w === 'string') {
      out.push({ id: w, size: 'md' });
    } else if (w && typeof w === 'object') {
      const id = (w as { id?: unknown }).id;
      const size = (w as { size?: unknown }).size;
      if (typeof id === 'string') {
        out.push({ id, size: typeof size === 'string' && WIDGET_SIZES.has(size) ? size : 'md' });
      }
    }
  }
  return out;
}

// Tenant-scoped "me" endpoints: who am I (user + tenant), tenant stats.
@ApiTags('me')
@UseGuards(TenantAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: AiBudgetService,
  ) {}

  /**
   * Automation settings the tenant owns: AI on inbound messages, the monthly
   * token cap, and which alert rules run.
   *
   * These exist because a customer reported tasks and alerts appearing in their
   * account with no way to stop them, and because nothing capped AI spend.
   */
  @Get('automation')
  @UseGuards(PermissionsGuard)
  @RequirePerm('settings')
  async automation(@CurrentUser() user: AuthenticatedUser) {
    const tenant = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { aiInboundAnalysis: true, aiMonthlyTokenCap: true, alertRules: true },
      }),
    );
    const usage = await this.budget.status(user.tenantId);
    return {
      aiInboundAnalysis: tenant.aiInboundAnalysis,
      aiMonthlyTokenCap: tenant.aiMonthlyTokenCap,
      alertRules: resolveAlertRules(tenant.alertRules),
      tokensThisMonth: usage.tokensThisMonth,
    };
  }

  @Patch('automation')
  @UseGuards(PermissionsGuard)
  @RequirePerm('settings')
  async saveAutomation(
    @Body()
    body: {
      aiInboundAnalysis?: boolean;
      aiMonthlyTokenCap?: number | null;
      alertRules?: unknown;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const cap =
      body.aiMonthlyTokenCap === undefined
        ? undefined
        : body.aiMonthlyTokenCap === null || body.aiMonthlyTokenCap <= 0
          ? null
          : Math.min(Math.round(body.aiMonthlyTokenCap), 1_000_000_000);

    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.tenant.update({
        where: { id: user.tenantId },
        data: {
          ...(body.aiInboundAnalysis === undefined
            ? {}
            : { aiInboundAnalysis: !!body.aiInboundAnalysis }),
          ...(cap === undefined ? {} : { aiMonthlyTokenCap: cap }),
          ...(body.alertRules === undefined
            ? {}
            : { alertRules: resolveAlertRules(body.alertRules) as unknown as object }),
        },
      }),
    );
    // El presupuesto se cachea un minuto: sin esto el cambio no se notaría.
    this.budget.invalidate(user.tenantId);
    return this.automation(user);
  }

  @Get('tenant')
  tenant(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        include: {
          _count: { select: { users: true, bots: true, agents: true, accessLogs: true } },
        },
      });
      return tenant;
    });
  }

  @Get('dashboard')
  async dashboard(@CurrentUser() user: AuthenticatedUser) {
    const u = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.user.findUnique({ where: { id: user.userId }, select: { dashboardConfig: true } }),
    );
    const cfg = (u?.dashboardConfig ?? null) as { widgets?: unknown } | null;
    return { widgets: normalizeWidgets(cfg?.widgets) };
  }

  @Patch('dashboard')
  async saveDashboard(@Body() body: { widgets?: unknown }, @CurrentUser() user: AuthenticatedUser) {
    const widgets = normalizeWidgets(body?.widgets) ?? [];
    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.user.update({ where: { id: user.userId }, data: { dashboardConfig: { widgets } } }),
    );
    return { ok: true, widgets };
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [tenant, users, bots, agents, recentLogs, weeklyLogs] = await Promise.all([
        tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } }),
        tx.user.count(),
        tx.bot.count(),
        tx.agent.count(),
        tx.accessLog.count({ where: { createdAt: { gte: last24h } } }),
        tx.accessLog.count({ where: { createdAt: { gte: last7d } } }),
      ]);

      return {
        limits: {
          maxUsers: tenant.maxUsers,
          maxBots: tenant.maxBots,
          maxConversationsPerMonth: tenant.maxConversationsPerMonth,
          maxStorageGb: tenant.maxStorageGb,
        },
        usage: {
          users,
          bots,
          agents,
          accessLogs24h: recentLogs,
          accessLogs7d: weeklyLogs,
        },
      };
    });
  }
}
