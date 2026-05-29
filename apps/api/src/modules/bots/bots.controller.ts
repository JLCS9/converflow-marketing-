import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createBotSchema,
  BadRequestError,
  NotFoundError,
  TenantLimitReachedError,
} from '@converflow/shared';
import type { Bot } from '@converflow/db';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { BotRunnerService } from './bot-runner.service.js';

const updateBotSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  agentId: z.string().cuid().nullable().optional(),
  maxMessagesPerMinute: z.number().int().min(1).max(600).optional(),
  maxMessagesPerHour: z.number().int().min(1).max(20000).optional(),
});

// Real Baileys integration lives in apps/bot-runner. This controller only
// owns CRUD over the `bots` table and dispatches start/stop commands to
// the runner via Redis pub/sub (implemented in Fase 3).
@ApiTags('bots')
@UseGuards(TenantAuthGuard)
@Controller('bots')
export class BotsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botRunner: BotRunnerService,
  ) {}

  private getOwnedBot(tenantId: string, id: string): Promise<Bot> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bot = await tx.bot.findUnique({ where: { id } });
      if (!bot) throw new NotFoundError('Bot no encontrado');
      return bot;
    });
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Bot[]> {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.bot.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Bot> {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const bot = await tx.bot.findUnique({ where: { id } });
      if (!bot) throw new NotFoundError('Bot no encontrado');
      return bot;
    });
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
          phoneNumber: data.phoneNumber
            ? data.channel === 'EMAIL'
              ? data.phoneNumber.trim().toLowerCase()
              : data.phoneNumber.trim()
            : undefined,
        },
      });
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Bot> {
    const data = updateBotSchema.parse(body);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const bot = await tx.bot.findUnique({ where: { id } });
      if (!bot) throw new NotFoundError('Bot no encontrado');
      return tx.bot.update({ where: { id }, data });
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const bot = await tx.bot.findUnique({ where: { id } });
      if (!bot) throw new NotFoundError('Bot no encontrado');
      await tx.bot.delete({ where: { id } });
      return { ok: true };
    });
  }

  // --- WhatsApp connection (Baileys, via bot-runner) -------------------------

  @Post(':id/connect')
  async connect(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const bot = await this.getOwnedBot(user.tenantId, id);
    if (bot.channel !== 'WHATSAPP') {
      throw new BadRequestError('Solo los bots de WhatsApp se conectan por QR');
    }
    return this.botRunner.start(id, user.tenantId);
  }

  @Post(':id/disconnect')
  async disconnect(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.getOwnedBot(user.tenantId, id);
    await this.botRunner.stop(id);
    return { ok: true };
  }

  // Polled by the UI (~2s) while pairing: returns live status + QR data URL.
  @Get(':id/connection')
  async connection(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const bot = await this.getOwnedBot(user.tenantId, id);
    try {
      const state = await this.botRunner.state(id);
      return {
        status: state.status,
        qr: state.qr ?? null,
        persistedStatus: bot.status,
        phoneNumber: bot.phoneNumber,
      };
    } catch {
      // bot-runner unreachable — fall back to the persisted status.
      return { status: bot.status, qr: null, persistedStatus: bot.status, phoneNumber: bot.phoneNumber };
    }
  }
}
