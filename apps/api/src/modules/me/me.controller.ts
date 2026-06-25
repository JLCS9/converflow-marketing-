import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

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
  constructor(private readonly prisma: PrismaService) {}

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
