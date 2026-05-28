import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  proposeMeetingSchema,
  scheduleMeetingSchema,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { GoogleCalendarService } from '../../common/google/google-calendar.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { generateFreeSlots } from './slot-utils.js';

interface ProposeOutput {
  picks: { index: number; reason: string }[];
  title: string;
  agenda: string;
}

const PROPOSE_WINDOW_DAYS = 10;

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly google: GoogleCalendarService,
    private readonly integrations: IntegrationsService,
  ) {}

  async propose(tenantId: string, userId: string, input: unknown) {
    const data = proposeMeetingSchema.parse(input);
    const durationMin = data.durationMin ?? 30;

    // 1. Fetch lead + tenant timezone (quick transaction).
    const ctx = await this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: data.leadId },
        include: { notes: { orderBy: { createdAt: 'desc' }, take: 5 } },
      });
      if (!lead) throw new NotFoundError('Lead no encontrado');
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      return { lead, tz: tenant.timezone };
    });

    // 2. Read availability from Google Calendar.
    const { accessToken, calendarId } = await this.integrations.getValidAccess(tenantId, userId);
    const now = new Date();
    const timeMaxIso = new Date(now.getTime() + PROPOSE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    const busy = await this.google.freeBusy(accessToken, {
      timeMinIso: now.toISOString(),
      timeMaxIso,
      calendarId,
    });

    const slots = generateFreeSlots({
      now,
      tz: ctx.tz,
      durationMin,
      busy,
      days: PROPOSE_WINDOW_DAYS,
      maxSlots: 12,
    });

    const labelFmt = new Intl.DateTimeFormat('es-ES', {
      timeZone: ctx.tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (slots.length === 0) {
      return {
        connected: true,
        slots: [],
        message: `No hay huecos libres en los próximos ${PROPOSE_WINDOW_DAYS} días dentro del horario laboral (L-V 9-18, ${ctx.tz}).`,
        durationMin,
      };
    }

    const candidates = slots.map((s, idx) => `${idx}: ${labelFmt.format(new Date(s.startIso))}`).join('\n');
    const noteSummary = ctx.lead.notes.length
      ? ctx.lead.notes.map((n) => `- ${n.body.slice(0, 150)}`).join('\n')
      : '(sin notas)';

    const userPrompt = [
      'Eres un asistente comercial. Propón hasta 3 huecos para una reunión con este lead,',
      'eligiéndolos SOLO de la lista de huecos disponibles (usa sus índices).',
      '',
      `Lead: ${ctx.lead.name}`,
      `Empresa: ${ctx.lead.company ?? '(no indicada)'}`,
      `Status: ${ctx.lead.status}`,
      `Score: ${ctx.lead.score ?? '(sin calcular)'}`,
      `Duración deseada: ${durationMin} min`,
      data.notes ? `Contexto del comercial: ${data.notes}` : '',
      '',
      'Notas recientes:',
      noteSummary,
      '',
      'Huecos disponibles (índice: fecha/hora local):',
      candidates,
      '',
      'Criterios: prioriza antes los leads con score alto o intención de compra;',
      'evita el primer hueco de la mañana si no hay urgencia; reparte los 3 en días distintos si puedes.',
      'Devuelve también un título conciso para la reunión y una agenda de 1-2 líneas.',
    ]
      .filter(Boolean)
      .join('\n');

    // 3. Claude call OUTSIDE any transaction.
    const call = await this.ai.callWithTool<ProposeOutput>({
      system: 'Eres un asistente comercial B2B en España. Respondes en castellano, conciso.',
      userPrompt,
      toolName: 'propose_meeting_slots',
      toolDescription: 'Elige hasta 3 huecos (por índice) y propón título + agenda.',
      toolInputSchema: {
        type: 'object',
        properties: {
          picks: {
            type: 'array',
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                reason: { type: 'string' },
              },
              required: ['index', 'reason'],
            },
          },
          title: { type: 'string' },
          agenda: { type: 'string' },
        },
        required: ['picks', 'title', 'agenda'],
      },
      maxTokens: 700,
    });

    void this.ai.recordUsage({
      tenantId,
      feature: 'meeting_proposal',
      callResult: call,
      resourceType: 'lead',
      resourceId: data.leadId,
    });

    const chosen = call.result.picks
      .filter((p) => Number.isInteger(p.index) && p.index >= 0 && p.index < slots.length)
      .slice(0, 3)
      .map((p) => ({
        startIso: slots[p.index]!.startIso,
        endIso: slots[p.index]!.endIso,
        localLabel: labelFmt.format(new Date(slots[p.index]!.startIso)),
        reason: p.reason,
      }));

    const finalSlots = chosen.length
      ? chosen
      : slots.slice(0, 3).map((s) => ({
          startIso: s.startIso,
          endIso: s.endIso,
          localLabel: labelFmt.format(new Date(s.startIso)),
          reason: '',
        }));

    return {
      connected: true,
      slots: finalSlots,
      title: call.result.title,
      agenda: call.result.agenda,
      durationMin,
      ai: { model: call.model, costUsd: call.costUsd, durationMs: call.durationMs },
    };
  }

  async schedule(tenantId: string, userId: string, input: unknown) {
    const data = scheduleMeetingSchema.parse(input);

    const ctx = await this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: data.leadId } });
      if (!lead) throw new NotFoundError('Lead no encontrado');
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      return { lead, tz: tenant.timezone };
    });

    const { accessToken, calendarId } = await this.integrations.getValidAccess(tenantId, userId);
    const start = new Date(data.startIso);
    const end = new Date(start.getTime() + data.durationMin * 60_000);

    // Defensive: re-check the slot is still free at schedule time.
    const busy = await this.google.freeBusy(accessToken, {
      timeMinIso: start.toISOString(),
      timeMaxIso: end.toISOString(),
      calendarId,
    });
    if (busy.length > 0) {
      throw new ConflictError('Ese hueco ya está ocupado en tu calendario, elige otro');
    }

    const event = await this.google.insertEvent(accessToken, calendarId, {
      summary: data.title,
      description: data.description,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      timeZone: ctx.tz,
      attendeeEmails: ctx.lead.email ? [ctx.lead.email] : undefined,
    });

    let task = null;
    if (data.createTask !== false) {
      task = await this.prisma.withTenant(tenantId, (tx) =>
        tx.task.create({
          data: {
            tenantId,
            title: data.title,
            description: data.description,
            type: 'MEETING',
            status: 'PENDING',
            priority: 'MEDIUM',
            dueAt: start,
            leadId: data.leadId,
            ownerId: userId,
            source: 'ai_meeting',
          },
        }),
      );
    }

    return { event, task };
  }
}
