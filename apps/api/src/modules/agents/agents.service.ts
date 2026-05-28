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
