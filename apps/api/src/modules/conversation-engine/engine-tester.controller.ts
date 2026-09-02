import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { ConversationEngineService } from './conversation-engine.service.js';
import { CRM_TOOL_DEFS } from '../conversations/crm-actions.service.js';

const testSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ direction: z.enum(['IN', 'OUT']), body: z.string().max(4000) }))
    .max(20)
    .optional(),
  channel: z.enum(['WEBCHAT', 'WHATSAPP', 'EMAIL']).optional(),
});

/**
 * E3 · Probador REAL del asistente: ejecuta engine.respond — el mismo código
 * de producción, con las mismas fuentes y verificadas — en modo dry-run:
 * sin persistir extracción/lagunas/consentimiento y con las tools CRM
 * simuladas (el catálogo REAL envuelto, no una copia).
 */
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('agents')
@Controller('engine')
export class EngineTesterController {
  constructor(
    private readonly engine: ConversationEngineService,
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  @Post('test')
  async test(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = testSchema.parse(body);
    const tenantId = user.tenantId;

    // Identidad + tools del asistente por defecto del tenant (mismo criterio
    // que el runtime: el Agent CONVERSATIONAL publicado más reciente).
    const agent = await this.prisma.withTenant(tenantId, (tx) =>
      tx.agent.findFirst({
        where: { type: 'CONVERSATIONAL', status: 'PUBLISHED' },
        orderBy: { updatedAt: 'desc' },
        select: { config: true },
      }),
    );
    const config = (agent?.config ?? {}) as {
      tone?: string;
      language?: string;
      tools?: string[];
      support?: { enabled?: boolean };
    };
    const toolNames = new Set(config.tools ?? []);
    if (config.support?.enabled) toolNames.add('create_support_task');
    const defs = [...toolNames]
      .map((n) => CRM_TOOL_DEFS[n])
      .filter((d): d is NonNullable<typeof d> => Boolean(d));

    const res = await this.engine.respond(tenantId, {
      channel: input.channel ?? 'WEBCHAT',
      text: input.message,
      history: input.history ?? [],
      profileId: null,
      leadWaiting: false,
      identity: { tone: config.tone ?? null, language: config.language ?? null },
      // Catálogo REAL envuelto en un executor simulado: si mañana se añade
      // una tool, el probador la ve sin sincronización manual.
      tools: defs.length
        ? {
            defs,
            execute: (name) => Promise.resolve(`SIMULADO (probador): se ejecutaría ${name}.`),
          }
        : null,
      dryRun: true,
    });

    void this.ai.recordUsage({
      tenantId,
      feature: 'engine_test',
      callResult: { ...res.usage, result: res.reply } as never,
      resourceType: 'engine_test',
      metadata: { canAnswer: res.canAnswer, sources: res.sources },
    });

    return {
      reply: res.reply,
      canAnswer: res.canAnswer,
      wouldExtract: res.extractedKeys,
      wouldActions: res.actions.map((a) => a.name),
      sources: res.sourceBlocks ?? [],
    };
  }
}
