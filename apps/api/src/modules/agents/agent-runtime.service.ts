import { Injectable, Logger } from '@nestjs/common';
import type { AgentConfig } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { AgentsService } from './agents.service.js';

interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const OPP_STATUSES = ['OPEN', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST'];

// Tool catalogue — only the ones enabled on the agent are exposed to Claude.
const TOOL_DEFS: Record<string, ToolDef> = {
  create_opportunity: {
    name: 'create_opportunity',
    description:
      'Abre una nueva oportunidad de venta para este lead cuando muestra interés claro de compra. No la uses para preguntas genéricas.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre corto de la oportunidad' },
        amount: { type: 'number', description: 'Importe estimado en EUR (opcional)' },
      },
      required: ['name'],
    },
  },
  update_opportunity: {
    name: 'update_opportunity',
    description:
      'Actualiza la oportunidad abierta del lead (etapa/importe) cuando la conversación lo justifica.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: OPP_STATUSES },
        amount: { type: 'number' },
        probability: { type: 'integer', minimum: 0, maximum: 100 },
      },
    },
  },
  schedule_meeting: {
    name: 'schedule_meeting',
    description:
      'Crea una tarea de reunión/cita para el equipo cuando el cliente quiere agendar. Incluye la hora preferida si la dice.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        dueAt: { type: 'string', description: 'Fecha/hora ISO 8601 si el cliente la indica' },
      },
    },
  },
  escalate_to_human: {
    name: 'escalate_to_human',
    description:
      'Marca la conversación para que la atienda una persona cuando no puedes resolver o el cliente lo pide.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
    },
  },
};

interface ToolCtx {
  tenantId: string;
  leadId: string | null;
  conversationId: string;
}

interface LeadCtx {
  id: string;
  name: string;
  company: string | null;
  status: string;
  score: number | null;
}

@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly agents: AgentsService,
  ) {}

  /**
   * Run the agent for one inbound message: it may call tools (which execute
   * real CRM actions) and produces a reply, stored as the message's suggested
   * reply for the human to review/send (SUGGEST mode). Auto-send is v1d.
   */
  async runForMessage(opts: {
    tenantId: string;
    agentId: string;
    conversationId: string;
    messageId: string;
    userText: string;
    lead: LeadCtx | null;
  }): Promise<void> {
    const { tenantId, agentId, conversationId, messageId, userText, lead } = opts;

    const agent = await this.prisma.withTenant(tenantId, (tx) =>
      tx.agent.findUnique({ where: { id: agentId } }),
    );
    if (!agent || agent.status === 'ARCHIVED') {
      throw new Error('agent_unavailable'); // caller falls back to generic classify
    }

    const config = (agent.config ?? {}) as AgentConfig;
    const enabledTools = (config.tools ?? [])
      .map((t) => TOOL_DEFS[t])
      .filter((d): d is ToolDef => !!d);

    // Recent transcript for context (read in a short txn).
    const history = await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.findMany({
        where: { conversationId, id: { not: messageId } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { direction: true, body: true },
      }),
    );
    const transcript = history
      .reverse()
      .map((m) => `${m.direction === 'IN' ? 'Cliente' : 'Nosotros'}: ${m.body ?? '[media]'}`)
      .join('\n');

    const system = [
      this.agents.buildSystemPrompt(agent),
      lead
        ? `CONTACTO: ${lead.name}${lead.company ? ` (${lead.company})` : ''} · estado ${lead.status}${lead.score != null ? ` · score ${lead.score}` : ''}.`
        : '',
      enabledTools.length
        ? 'Tienes herramientas para actuar en el CRM. Úsalas SOLO cuando la conversación lo justifique claramente; no las uses por defecto. Tu respuesta de texto es lo que se le enviará al cliente.'
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const userPrompt = [
      transcript ? `Historial reciente:\n${transcript}\n` : '',
      `Último mensaje del cliente:\n"""${userText}"""`,
      '',
      'Redacta la mejor respuesta para el cliente (clara y breve). Usa herramientas si procede.',
    ]
      .filter(Boolean)
      .join('\n');

    const ctx: ToolCtx = { tenantId, leadId: lead?.id ?? null, conversationId };

    const call = await this.ai.runAgentLoop({
      model: agent.model,
      system,
      userPrompt,
      tools: enabledTools,
      executeTool: (name, input) => this.executeTool(ctx, name, input),
      maxIterations: 4,
      maxTokens: 800,
    });

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.update({
        where: { id: messageId },
        data: { aiSuggestedReply: call.result || null, aiAnalyzedAt: new Date() },
      }),
    );

    void this.ai.recordUsage({
      tenantId,
      feature: 'agent_reply',
      callResult: call,
      resourceType: 'message',
      resourceId: messageId,
      metadata: { actions: call.actions },
    });

    if (call.actions.length) {
      this.logger.log(
        `agent ${agentId} acted: ${call.actions.map((a) => a.name).join(', ')}`,
      );
    }
  }

  private async executeTool(ctx: ToolCtx, name: string, input: unknown): Promise<string> {
    const args = (input ?? {}) as Record<string, unknown>;

    switch (name) {
      case 'create_opportunity':
        return this.createOpportunity(ctx, args);
      case 'update_opportunity':
        return this.updateOpportunity(ctx, args);
      case 'schedule_meeting':
        return this.scheduleMeeting(ctx, args);
      case 'escalate_to_human':
        return this.escalate(ctx);
      default:
        return `Herramienta desconocida: ${name}`;
    }
  }

  private createOpportunity(ctx: ToolCtx, args: Record<string, unknown>): Promise<string> {
    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      if (!ctx.leadId) return 'No hay lead asociado a la conversación.';
      const open = await tx.opportunity.findFirst({
        where: { leadId: ctx.leadId, status: { in: ['OPEN', 'QUOTED', 'NEGOTIATING'] } },
      });
      if (open) return `Ya existe una oportunidad abierta: "${open.name}".`;
      const name = String(args.name ?? '').trim() || 'Oportunidad WhatsApp';
      const amount = typeof args.amount === 'number' ? args.amount : undefined;
      const opp = await tx.opportunity.create({
        data: { tenantId: ctx.tenantId, leadId: ctx.leadId, name, status: 'OPEN', amount },
      });
      return `Oportunidad creada: "${opp.name}".`;
    });
  }

  private updateOpportunity(ctx: ToolCtx, args: Record<string, unknown>): Promise<string> {
    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      if (!ctx.leadId) return 'No hay lead asociado.';
      const opp = await tx.opportunity.findFirst({
        where: { leadId: ctx.leadId, status: { notIn: ['WON', 'LOST'] } },
        orderBy: { updatedAt: 'desc' },
      });
      if (!opp) return 'No hay una oportunidad abierta para actualizar.';
      const status =
        typeof args.status === 'string' && OPP_STATUSES.includes(args.status)
          ? args.status
          : undefined;
      await tx.opportunity.update({
        where: { id: opp.id },
        data: {
          status: status as never,
          amount: typeof args.amount === 'number' ? args.amount : undefined,
          probability: typeof args.probability === 'number' ? args.probability : undefined,
        },
      });
      return `Oportunidad "${opp.name}" actualizada.`;
    });
  }

  private scheduleMeeting(ctx: ToolCtx, args: Record<string, unknown>): Promise<string> {
    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      const dueAt =
        typeof args.dueAt === 'string' && !Number.isNaN(Date.parse(args.dueAt))
          ? new Date(args.dueAt)
          : undefined;
      await tx.task.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: ctx.leadId ?? undefined,
          title: String(args.title ?? '').trim() || 'Agendar reunión (WhatsApp)',
          type: 'MEETING',
          status: 'PENDING',
          priority: 'HIGH',
          dueAt,
          source: 'agent',
        },
      });
      return 'He creado una tarea de reunión para el equipo.';
    });
  }

  private escalate(ctx: ToolCtx): Promise<string> {
    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      await tx.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: 'PENDING' },
      });
      return 'Conversación marcada para que la atienda una persona.';
    });
  }
}
