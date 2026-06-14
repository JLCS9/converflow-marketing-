import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_AI_DISCLOSURE,
  TASK_PRIORITIES,
  type AgentConfig,
  type SupportConfig,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { BotRunnerService } from '../bots/bot-runner.service.js';
import { EmailService } from '../email/email.service.js';
import { AgentsService } from './agents.service.js';
import { env } from '../../config/env.js';

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
  create_support_task: {
    name: 'create_support_task',
    description:
      'Abre un ticket de soporte y lo asigna a la persona responsable cuando el cliente reporta una incidencia, queja o petición que requiere gestión humana (no para preguntas que ya puedes responder). Clasifica el tema para enrutarlo bien.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título corto y claro de la incidencia' },
        summary: {
          type: 'string',
          description: 'Resumen del caso para el responsable (qué pide el cliente y contexto).',
        },
        topic: {
          type: 'string',
          description: 'Tema/categoría de la incidencia (usa uno de los temas indicados si encaja).',
        },
        priority: { type: 'string', enum: [...TASK_PRIORITIES] },
      },
      required: ['title'],
    },
  },
};

interface ToolCtx {
  tenantId: string;
  leadId: string | null;
  conversationId: string;
  support?: SupportConfig;
  userText: string; // last inbound message — used for keyword routing
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
    private readonly botRunner: BotRunnerService,
    private readonly email: EmailService,
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
    const toolNames = new Set(config.tools ?? []);
    // Support ticketing turns the create_support_task tool on regardless of the
    // tools[] array, so enabling Soporte is a single switch in the builder.
    if (config.support?.enabled) toolNames.add('create_support_task');
    const enabledTools = [...toolNames]
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
      config.support?.enabled && config.support.routes?.length
        ? `Si abres un ticket de soporte, clasifica el tema (campo "topic") usando uno de estos cuando encaje: ${config.support.routes
            .map((r) => r.topic)
            .join(', ')}.`
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

    const ctx: ToolCtx = {
      tenantId,
      leadId: lead?.id ?? null,
      conversationId,
      support: config.support,
      userText,
    };

    const call = await this.ai.runAgentLoop({
      model: agent.model,
      system,
      userPrompt,
      tools: enabledTools,
      executeTool: (name, input) => this.executeTool(ctx, name, input),
      maxIterations: 4,
      maxTokens: 800,
    });

    const reply = call.result?.trim() ?? '';
    // Reply behaviour now lives on the Bot (Bot.replyMode). We resolve it
    // from the conversation's botId; if the bot is missing or has no
    // replyMode column yet (mid-deploy), we fall back to the legacy
    // Agent.config.mode so existing tenants keep working.
    const bot = await this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation
        .findUnique({
          where: { id: conversationId },
          select: { bot: { select: { replyMode: true } } },
        })
        .then((c) => c?.bot ?? null),
    );
    const mode: 'OFF' | 'SUGGEST' | 'AUTO' =
      bot?.replyMode ?? (config.mode === 'AUTO' ? 'AUTO' : 'SUGGEST');
    let delivered = false;
    if (mode === 'OFF') {
      // Channel is recording-only. We don't even store a suggestion.
      void this.ai.recordUsage({
        tenantId,
        feature: 'agent_reply',
        callResult: call,
        resourceType: 'message',
        resourceId: messageId,
        metadata: { mode: 'OFF', delivered: false },
      });
      return;
    }

    // Deliver the reply when the agent is in AUTO mode, or always for WEBCHAT
    // (our own surface — the widget shows the reply). tryAutoSend decides by
    // channel; otherwise the reply is stored as a suggestion for a human.
    if (reply) {
      delivered = await this.tryAutoSend(tenantId, conversationId, config, reply, mode);
    }

    if (!delivered) {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.message.update({
          where: { id: messageId },
          data: { aiSuggestedReply: reply || null, aiAnalyzedAt: new Date() },
        }),
      );
    }

    void this.ai.recordUsage({
      tenantId,
      feature: 'agent_reply',
      callResult: call,
      resourceType: 'message',
      resourceId: messageId,
      metadata: { actions: call.actions, mode, delivered },
    });

    if (call.actions.length) {
      this.logger.log(`agent ${agentId} acted: ${call.actions.map((a) => a.name).join(', ')}`);
    }
  }

  /** AUTO mode delivery: rate-limit → AI disclosure on first contact → send + record. */
  private async tryAutoSend(
    tenantId: string,
    conversationId: string,
    config: AgentConfig,
    reply: string,
    mode: 'OFF' | 'SUGGEST' | 'AUTO',
  ): Promise<boolean> {
    const conv = await this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.findUnique({
        where: { id: conversationId },
        select: { botId: true, contactJid: true, channel: true },
      }),
    );
    if (!conv?.botId) return false;

    // WEBCHAT always auto-delivers (our own surface). External channels only in AUTO mode.
    const isWebchat = conv.channel === 'WEBCHAT';
    if (!isWebchat && mode !== 'AUTO') return false;

    // Rate limit only applies to external transports (WhatsApp).
    if (conv.channel === 'WHATSAPP' && !(await this.withinRateLimit(tenantId, conv.botId))) {
      this.logger.warn(`auto-send rate-limited for bot ${conv.botId}; falling back to suggestion`);
      return false;
    }

    const priorOut = await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.count({ where: { conversationId, direction: 'OUT' } }),
    );
    // WEBCHAT shows the AI disclosure persistently in the widget header, so we
    // don't prepend it there; external channels get it on first contact.
    const disclosure = (config.aiDisclosure ?? DEFAULT_AI_DISCLOSURE).trim();
    const text = !isWebchat && priorOut === 0 && disclosure ? `${disclosure}\n\n${reply}` : reply;

    let sentId: string | undefined;
    if (conv.channel === 'WHATSAPP') {
      try {
        const res = await this.botRunner.sendText(conv.botId, conv.contactJid, text);
        sentId = res.id;
      } catch (err) {
        this.logger.warn({ err }, 'auto-send failed; falling back to suggestion');
        return false;
      }
    } else if (conv.channel === 'EMAIL') {
      try {
        const res = await this.email.replyToConversation(tenantId, conversationId, text);
        sentId = res.id;
      } catch (err) {
        this.logger.warn({ err }, 'auto email-send failed; falling back to suggestion');
        return false;
      }
    }
    // WEBCHAT: no transport — the OUT message below is what the widget polls.

    await this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      await tx.message.create({
        data: { tenantId, conversationId, direction: 'OUT', waMessageId: sentId, body: text },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'ANSWERED',
          lastMessageAt: now,
          lastMessagePreview: text.slice(0, 140),
          lastOutboundAt: now,
          unreadCount: 0,
        },
      });
    });
    return true;
  }

  private async withinRateLimit(tenantId: string, botId: string): Promise<boolean> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bot = await tx.bot.findUnique({
        where: { id: botId },
        select: { maxMessagesPerMinute: true },
      });
      const limit = bot?.maxMessagesPerMinute ?? 60;
      const since = new Date(Date.now() - 60_000);
      const count = await tx.message.count({
        where: { direction: 'OUT', createdAt: { gte: since }, conversation: { botId } },
      });
      return count < limit;
    });
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
        return this.escalate(ctx, args);
      case 'create_support_task':
        return this.createSupportTask(ctx, args);
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

  private async escalate(ctx: ToolCtx, args: Record<string, unknown>): Promise<string> {
    await this.prisma.withTenant(ctx.tenantId, (tx) =>
      tx.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: 'PENDING' },
      }),
    );
    // When Soporte is on, escalating also opens an assigned, notified ticket so
    // the case lands in someone's queue — not just flagged in the inbox.
    if (ctx.support?.enabled) {
      const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
      const ticket = await this.openSupportTicket(ctx, {
        title: reason ? `Escalado: ${reason}`.slice(0, 150) : 'Conversación escalada a soporte',
        summary: reason || undefined,
        topic: reason || undefined,
      });
      return `Conversación marcada para una persona. ${ticket}`;
    }
    return 'Conversación marcada para que la atienda una persona.';
  }

  private async createSupportTask(ctx: ToolCtx, args: Record<string, unknown>): Promise<string> {
    if (!ctx.support?.enabled) {
      return 'El soporte por tickets no está activado para este agente.';
    }
    const priorityArg = typeof args.priority === 'string' ? args.priority : '';
    return this.openSupportTicket(ctx, {
      title: String(args.title ?? '').trim() || 'Incidencia de soporte',
      summary: typeof args.summary === 'string' ? args.summary.trim() || undefined : undefined,
      topic: typeof args.topic === 'string' ? args.topic.trim() || undefined : undefined,
      priority: (TASK_PRIORITIES as readonly string[]).includes(priorityArg)
        ? (priorityArg as (typeof TASK_PRIORITIES)[number])
        : undefined,
    });
  }

  /**
   * Create a SUPPORT task, route it to a responsible user (topic/keyword rules
   * → fallback), and email them. DB work runs in a transaction; the email is
   * fire-and-forget OUTSIDE it (SMTP/Resend are slow — lesson: never inside a
   * Prisma txn). Returns a short status string for the agent loop.
   */
  private async openSupportTicket(
    ctx: ToolCtx,
    input: {
      title: string;
      summary?: string;
      topic?: string;
      priority?: (typeof TASK_PRIORITIES)[number];
    },
  ): Promise<string> {
    const support = ctx.support!;
    const ownerId = this.resolveSupportOwner(support, {
      topic: input.topic,
      text: ctx.userText,
    });
    const priority = input.priority ?? support.defaultPriority ?? 'MEDIUM';

    const result = await this.prisma.withTenant(ctx.tenantId, async (tx) => {
      // Only assign to an active user of this tenant; otherwise leave unassigned.
      const owner = ownerId
        ? await tx.user.findFirst({
            where: { id: ownerId, status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
          })
        : null;

      const descriptionParts = [
        input.summary,
        input.topic ? `Tema: ${input.topic}` : '',
        `Mensaje del cliente: ${ctx.userText}`.slice(0, 1000),
      ].filter(Boolean);

      const task = await tx.task.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: ctx.leadId ?? undefined,
          title: input.title.slice(0, 150),
          description: descriptionParts.join('\n\n') || undefined,
          type: 'SUPPORT',
          status: 'PENDING',
          priority,
          ownerId: owner?.id,
          source: 'agent',
        },
        select: { id: true },
      });

      const leadName = ctx.leadId
        ? (await tx.lead.findUnique({ where: { id: ctx.leadId }, select: { name: true } }))?.name
        : null;

      return { taskId: task.id, owner, leadName };
    });

    if (result.owner?.email) {
      // Fire-and-forget: a slow mailbox must not stall the agent's reply.
      void this.sendSupportEmail(ctx.tenantId, {
        toEmail: result.owner.email,
        title: input.title,
        priority,
        topic: input.topic,
        summary: input.summary,
        leadName: result.leadName ?? null,
      }).catch((err) => this.logger.warn({ err }, 'support notify email failed'));
    }

    if (!result.owner) {
      return 'He creado un ticket de soporte (sin responsable asignado: revisa las reglas de enrutado).';
    }
    return `He creado un ticket de soporte y se lo he asignado a ${result.owner.name}, que recibirá un aviso por email.`;
  }

  /** Topic exact-match → keyword-match → fallback. Returns null if nothing matches. */
  private resolveSupportOwner(
    support: SupportConfig,
    sel: { topic?: string; text?: string },
  ): string | null {
    const routes = support.routes ?? [];
    const topic = sel.topic?.toLowerCase().trim();
    const hay = `${sel.topic ?? ''} ${sel.text ?? ''}`.toLowerCase();

    const byTopic = topic ? routes.find((r) => r.topic.toLowerCase() === topic) : undefined;
    if (byTopic) return byTopic.ownerId;

    const byKeyword = routes.find((r) =>
      (r.keywords ?? []).some((k) => k && hay.includes(k.toLowerCase())),
    );
    if (byKeyword) return byKeyword.ownerId;

    return support.fallbackOwnerId ?? null;
  }

  private async sendSupportEmail(
    tenantId: string,
    opts: {
      toEmail: string;
      title: string;
      priority: string;
      topic?: string;
      summary?: string;
      leadName: string | null;
    },
  ): Promise<void> {
    const base = env.WEB_PUBLIC_URL.replace(/\/$/, '');
    const lines = [
      `Se te ha asignado un ticket de soporte.`,
      ``,
      `Asunto: ${opts.title}`,
      `Prioridad: ${opts.priority}`,
      opts.topic ? `Tema: ${opts.topic}` : '',
      opts.leadName ? `Cliente: ${opts.leadName}` : '',
      opts.summary ? `\nResumen:\n${opts.summary}` : '',
      ``,
      `Gestiónalo aquí: ${base}/app/tasks`,
      `Conversación: ${base}/app/conversations`,
      ``,
      `— Converflow`,
    ].filter((l) => l !== '');
    await this.email.notifyUser(tenantId, {
      toEmail: opts.toEmail,
      subject: `[Soporte] ${opts.title}`,
      text: lines.join('\n'),
    });
  }
}
