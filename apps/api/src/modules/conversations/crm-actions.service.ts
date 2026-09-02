import { Injectable, Logger } from '@nestjs/common';
import { TASK_PRIORITIES, type SupportConfig } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { env } from '../../config/env.js';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface CrmActionCtx {
  tenantId: string;
  leadId: string | null;
  conversationId: string;
  support?: SupportConfig;
  /** Último mensaje entrante — para el enrutado por palabras clave. */
  userText: string;
}

const OPP_STATUSES = ['OPEN', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST'];

/**
 * E1 · Catálogo de herramientas CRM del asistente. Port literal de
 * agent-runtime (que muere en E2): estas acciones son lo único del legado
 * que el motor no podía sustituir. Solo se exponen al modelo las habilitadas
 * en el agente; `create_support_task` se autoactiva con Soporte.
 */
export const CRM_TOOL_DEFS: Record<string, ToolDef> = {
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

/** Tools habilitadas para un agente (mismas reglas que el legado). */
export function enabledToolDefs(config: {
  tools?: string[];
  support?: SupportConfig;
}): ToolDef[] {
  const names = new Set(config.tools ?? []);
  if (config.support?.enabled) names.add('create_support_task');
  return [...names].map((n) => CRM_TOOL_DEFS[n]).filter((d): d is ToolDef => Boolean(d));
}

@Injectable()
export class CrmActionsService {
  private readonly logger = new Logger(CrmActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async execute(ctx: CrmActionCtx, name: string, input: unknown): Promise<string> {
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

  private createOpportunity(ctx: CrmActionCtx, args: Record<string, unknown>): Promise<string> {
    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      if (!ctx.leadId) return 'No hay lead asociado a la conversación.';
      const open = await tx.opportunity.findFirst({
        where: { leadId: ctx.leadId, status: { in: ['OPEN', 'QUOTED', 'NEGOTIATING'] } },
      });
      if (open) return `Ya existe una oportunidad abierta: "${open.name}".`;
      const name = String(args.name ?? '').trim() || 'Oportunidad de conversación';
      const amount = typeof args.amount === 'number' ? args.amount : undefined;
      const opp = await tx.opportunity.create({
        data: { tenantId: ctx.tenantId, leadId: ctx.leadId, name, status: 'OPEN', amount },
      });
      return `Oportunidad creada: "${opp.name}".`;
    });
  }

  private updateOpportunity(ctx: CrmActionCtx, args: Record<string, unknown>): Promise<string> {
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

  private scheduleMeeting(ctx: CrmActionCtx, args: Record<string, unknown>): Promise<string> {
    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      const dueAt =
        typeof args.dueAt === 'string' && !Number.isNaN(Date.parse(args.dueAt))
          ? new Date(args.dueAt)
          : undefined;
      await tx.task.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: ctx.leadId ?? undefined,
          title: String(args.title ?? '').trim() || 'Agendar reunión',
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

  private async escalate(ctx: CrmActionCtx, args: Record<string, unknown>): Promise<string> {
    await this.prisma.withTenant(ctx.tenantId, (tx) =>
      tx.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: 'PENDING' },
      }),
    );
    // Con Soporte activo, escalar también abre un ticket asignado y avisado:
    // el caso cae en la cola de alguien, no solo marcado en el inbox.
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

  private async createSupportTask(ctx: CrmActionCtx, args: Record<string, unknown>): Promise<string> {
    if (!ctx.support?.enabled) {
      return 'El soporte por tickets no está activado para este asistente.';
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
   * Crea la Task SUPPORT, la enruta (topic exacto → keyword → fallback) y
   * avisa por email al responsable FUERA de la transacción (SMTP es lento —
   * lección heredada: jamás dentro de una txn de Prisma).
   */
  private async openSupportTicket(
    ctx: CrmActionCtx,
    input: {
      title: string;
      summary?: string;
      topic?: string;
      priority?: (typeof TASK_PRIORITIES)[number];
    },
  ): Promise<string> {
    const support = ctx.support!;
    const ownerId = this.resolveSupportOwner(support, { topic: input.topic, text: ctx.userText });
    const priority = input.priority ?? support.defaultPriority ?? 'MEDIUM';

    const result = await this.prisma.withTenant(ctx.tenantId, async (tx) => {
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

  /** Topic exacto → keyword → fallback. Null si nada casa. */
  resolveSupportOwner(support: SupportConfig, sel: { topic?: string; text?: string }): string | null {
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
