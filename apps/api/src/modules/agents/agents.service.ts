import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createAgentSchema,
  updateAgentSchema,
  testAgentSchema,
  type AgentConfig,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.agent.findMany({ orderBy: { updatedAt: 'desc' } }),
    );
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findUnique({ where: { id } });
      if (!agent) throw new NotFoundError('Agente no encontrado');
      return agent;
    });
  }

  async create(tenantId: string, input: unknown) {
    const data = createAgentSchema.parse(input);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.agent.create({
        data: {
          tenantId,
          name: data.name,
          description: data.description,
          systemPrompt: data.systemPrompt,
          model: data.model ?? 'claude-sonnet-4-6',
          status: (data.status ?? 'DRAFT') as never,
          config: (data.config ?? {}) as never,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: unknown) {
    const data = updateAgentSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findUnique({ where: { id } });
      if (!agent) throw new NotFoundError('Agente no encontrado');
      return tx.agent.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          systemPrompt: data.systemPrompt,
          model: data.model,
          status: data.status as never,
          config: data.config !== undefined ? (data.config as never) : undefined,
        },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findUnique({ where: { id } });
      if (!agent) throw new NotFoundError('Agente no encontrado');
      // Detach from any bots first (agentId is optional).
      await tx.bot.updateMany({ where: { agentId: id }, data: { agentId: null } });
      await tx.agent.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ---- E3 · Identidad del asistente único ------------------------------------

  /** El asistente por defecto del tenant: el CONVERSATIONAL publicado más
   *  reciente; si no existe, se crea («Asistente») y se asigna a los bots
   *  sin agente. Un solo cerebro visible para el usuario. */
  async getOrCreateAssistant(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      let agent = await tx.agent.findFirst({
        where: { type: 'CONVERSATIONAL', status: 'PUBLISHED' },
        orderBy: { updatedAt: 'desc' },
      });
      agent ??= await tx.agent.findFirst({
        where: { type: 'CONVERSATIONAL' },
        orderBy: { updatedAt: 'desc' },
      });
      if (!agent) {
        agent = await tx.agent.create({
          data: {
            tenantId,
            name: 'Asistente',
            systemPrompt: '',
            config: {},
            status: 'PUBLISHED',
            type: 'CONVERSATIONAL',
          },
        });
      }
      await tx.bot.updateMany({ where: { agentId: null }, data: { agentId: agent.id } });
      return agent;
    });
  }

  async getIdentity(tenantId: string) {
    const agent = await this.getOrCreateAssistant(tenantId);
    const cfg = (agent.config ?? {}) as Record<string, unknown>;
    return {
      agentId: agent.id,
      tone: (cfg.tone as string) ?? '',
      language: (cfg.language as string) ?? '',
      aiDisclosure: (cfg.aiDisclosure as string) ?? '',
      tools: (cfg.tools as string[]) ?? [],
      support: cfg.support ?? null,
    };
  }

  async updateIdentity(
    tenantId: string,
    input: {
      tone?: string;
      language?: string;
      aiDisclosure?: string;
      tools?: string[];
      support?: unknown;
    },
  ) {
    const agent = await this.getOrCreateAssistant(tenantId);
    await this.prisma.withTenant(tenantId, async (tx) => {
      const current = ((await tx.agent.findUnique({ where: { id: agent.id }, select: { config: true } }))
        ?.config ?? {}) as Record<string, unknown>;
      await tx.agent.update({
        where: { id: agent.id },
        data: {
          status: 'PUBLISHED',
          config: {
            ...current,
            ...(input.tone !== undefined ? { tone: input.tone } : {}),
            ...(input.language !== undefined ? { language: input.language } : {}),
            ...(input.aiDisclosure !== undefined ? { aiDisclosure: input.aiDisclosure } : {}),
            ...(input.tools !== undefined ? { tools: input.tools } : {}),
            ...(input.support !== undefined ? { support: input.support } : {}),
          } as never,
        },
      });
    });
    return this.getIdentity(tenantId);
  }

  /**
   * Build the system prompt for an agent from its prompt + config (knowledge,
   * tone, language) with a strict no-hallucination guardrail. Shared by the
   * playground and (later) the live agent runtime.
   */
  buildSystemPrompt(agent: {
    systemPrompt: string;
    config: unknown;
  }): string {
    const config = (agent.config ?? {}) as AgentConfig;
    const parts: string[] = [agent.systemPrompt];

    if (config.language) parts.push(`Responde SIEMPRE en ${config.language}.`);
    if (config.tone) parts.push(`Tono: ${config.tone}.`);

    parts.push(
      'REGLA CRÍTICA: responde ÚNICAMENTE con la información proporcionada abajo. ' +
        'Si la respuesta no está en esa información, dilo claramente y ofrece pasar con una ' +
        'persona — NUNCA inventes datos, precios, plazos ni compromisos.',
    );

    if (config.businessInfo) {
      parts.push(`INFORMACIÓN DE LA EMPRESA / PRODUCTO:\n${config.businessInfo}`);
    }
    if (config.faqs) {
      parts.push(`PREGUNTAS FRECUENTES:\n${config.faqs}`);
    }
    return parts.join('\n\n');
  }

  /** Playground: run a sample message through the agent (no tools yet). */
  async test(tenantId: string, id: string, input: unknown) {
    const data = testAgentSchema.parse(input);
    const agent = await this.findById(tenantId, id); // own its own short txn

    const call = await this.ai.complete({
      tenantId: tenantId,
      model: agent.model,
      system: this.buildSystemPrompt(agent),
      userPrompt: data.message,
      maxTokens: 600,
    });

    void this.ai.recordUsage({
      tenantId,
      feature: 'agent_playground',
      callResult: call,
      resourceType: 'agent',
      resourceId: id,
    });

    return {
      reply: call.result,
      model: call.model,
      costUsd: call.costUsd,
      durationMs: call.durationMs,
    };
  }
}
