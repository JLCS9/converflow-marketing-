import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createBotSchema, TenantLimitReachedError } from '@converflow/shared';
import type { Bot } from '@converflow/db';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

// Real Baileys integration lives in apps/bot-runner. This controller only
// owns CRUD over the `bots` table and dispatches start/stop commands to
// the runner via Redis pub/sub (implemented in Fase 3).
@ApiTags('bots')
@UseGuards(TenantAuthGuard)
@Controller('bots')
export class BotsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Bot[]> {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.bot.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser): Promise<Bot> {
    const data = createBotSchema.parse(body);

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const [tenant, count] = await Promise.all([
        tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } }),
        tx.bot.count(),
      ]);
      if (count >= tenant.maxBots) {
        throw new TenantLimitReachedError('bots', count, tenant.maxBots);
      }
      return tx.bot.create({
        data: {
          tenantId: user.tenantId,
          name: data.name,
          channel: data.channel,
          agentId: data.agentId,
        },
      });
    });
  }
}
