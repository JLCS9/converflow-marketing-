import { Injectable, Logger } from '@nestjs/common';
import { BadRequestError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { ConsentsService } from '../consents/consents.service.js';
import { ConversationsService } from '../conversations/conversations.service.js';

export interface PlaybookTrigger {
  on: 'transition' | 'event';
  /** Estado destino que dispara (on='transition'), p. ej. 'dormido'. */
  toState?: string;
  /** Tipo de evento que dispara (on='event'), p. ej. 'cart_abandoned'. */
  eventType?: string;
}

export interface PlaybookAction {
  kind: 'followup';
  /** Instrucciones para el borrador: qué decir, tono, qué ofrecer. */
  instructions: string;
}

export interface PlaybookGuardrails {
  /** Días mínimos entre acciones al mismo contacto (default 7). */
  maxPerContactDays?: number;
  /** Exigir consentimiento followup vigente (default true). */
  requireConsent?: boolean;
  /** Ventana de silencio para envíos AUTO (horas locales del servidor). */
  quietStartHour?: number;
  quietEndHour?: number;
}

const DEFAULT_FREQUENCY_DAYS = 7;
const DRAFT_MAX_TOKENS = 400;

/**
 * F3 · Playbooks: acciones automáticas declarativas con guardarraíles.
 * REGLA DURA del plan: toda acción nace en modo borrador-para-aprobar.
 * Las NO ejecuciones también se registran (SUPPRESSED + reason): son la
 * evidencia de los guardarraíles y la materia prima del aprendizaje F4.
 */
@Injectable()
export class PlaybooksService {
  private readonly logger = new Logger(PlaybooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly consents: ConsentsService,
    private readonly conversations: ConversationsService,
  ) {}

  // ---- CRUD -------------------------------------------------------------------

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.playbook.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  async upsert(
    tenantId: string,
    input: {
      id?: string;
      name: string;
      active?: boolean;
      trigger: PlaybookTrigger;
      action: PlaybookAction;
      mode?: 'DRAFT_APPROVE' | 'AUTO';
      guardrails?: PlaybookGuardrails;
    },
  ) {
    this.validateTrigger(input.trigger);
    if (input.action?.kind !== 'followup' || !input.action.instructions?.trim()) {
      throw new BadRequestError('action.kind debe ser followup con instrucciones');
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const data = {
        name: input.name.trim(),
        active: input.active ?? false,
        trigger: input.trigger as never,
        action: input.action as never,
        // La autonomía se gana: crear directamente en AUTO está permitido
        // solo vía update explícito, nunca por defecto.
        mode: (input.mode ?? 'DRAFT_APPROVE') as never,
        guardrails: (input.guardrails as never) ?? undefined,
      };
      if (input.id) {
        const existing = await tx.playbook.findUnique({ where: { id: input.id }, select: { id: true } });
        if (!existing) throw new NotFoundError('Playbook no encontrado');
        return tx.playbook.update({ where: { id: input.id }, data });
      }
      return tx.playbook.create({ data: { tenantId, ...data } });
    });
  }

  remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.playbook.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Playbook no encontrado');
      await tx.playbook.delete({ where: { id } });
      return { ok: true };
    });
  }

  private validateTrigger(t: PlaybookTrigger) {
    if (t?.on === 'transition' && t.toState?.trim()) return;
    if (t?.on === 'event' && t.eventType?.trim()) return;
    throw new BadRequestError("trigger debe ser {on:'transition',toState} o {on:'event',eventType}");
  }

  // ---- disparo ------------------------------------------------------------------

  /** Un perfil acaba de transicionar de estado (evento o barrido diario). */
  async onTransition(tenantId: string, profileId: string, toState: string) {
    const books = await this.matching(tenantId, (t) => t.on === 'transition' && t.toState === toState);
    for (const pb of books) await this.execute(tenantId, pb, profileId, { toState });
  }

  /** Ha llegado un evento NUEVO del plano de datos. */
  async onEvent(tenantId: string, profileId: string, eventType: string) {
    const books = await this.matching(tenantId, (t) => t.on === 'event' && t.eventType === eventType);
    for (const pb of books) await this.execute(tenantId, pb, profileId, { eventType });
  }

  private async matching(tenantId: string, pred: (t: PlaybookTrigger) => boolean) {
    const books = await this.prisma.withTenant(tenantId, (tx) =>
      tx.playbook.findMany({ where: { active: true } }),
    );
    return books.filter((b) => pred(b.trigger as unknown as PlaybookTrigger));
  }

  // ---- ejecución con guardarraíles ------------------------------------------------

  private async execute(
    tenantId: string,
    playbook: { id: string; name: string; mode: string; action: unknown; guardrails: unknown },
    profileId: string,
    cause: Record<string, string>,
  ) {
    const rails = (playbook.guardrails as PlaybookGuardrails | null) ?? {};
    try {
      // Guardarraíl 1 · frecuencia: nada de bombardear al mismo contacto.
      const days = rails.maxPerContactDays ?? DEFAULT_FREQUENCY_DAYS;
      const recent = await this.prisma.withTenant(tenantId, (tx) =>
        tx.playbookRun.findFirst({
          where: {
            profileId,
            status: { in: ['DRAFT', 'APPROVED', 'SENT'] },
            createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
          },
          select: { id: true },
        }),
      );
      if (recent) return this.suppress(tenantId, playbook.id, profileId, 'frequency_cap', cause);

      // Guardarraíl 2 · consentimiento followup vigente (estricto por defecto).
      if (rails.requireConsent !== false) {
        const [phone, email] = await Promise.all([
          this.consents.hasConsent(tenantId, profileId, 'phone', 'followup'),
          this.consents.hasConsent(tenantId, profileId, 'email', 'followup'),
        ]);
        if (!phone && !email) {
          return this.suppress(tenantId, playbook.id, profileId, 'no_consent', cause);
        }
      }

      // Contexto: perfil + conversación más reciente de sus leads.
      const ctx = await this.gatherContext(tenantId, profileId);
      if (!ctx.conversationId) {
        return this.suppress(tenantId, playbook.id, profileId, 'no_channel', cause);
      }

      // Borrador con el modelo de redacción.
      const action = playbook.action as PlaybookAction;
      const call = await this.ai.callWithTool<{ message: string }>({
        tenantId,
        model: this.ai.modelFor('draft'),
        system:
          'Redactas mensajes de seguimiento breves y naturales para un negocio. ' +
          'Sigue las instrucciones del playbook al pie de la letra. Nada de presión ni urgencia falsa. ' +
          'Escribe en el idioma de la conversación previa. Máximo 3 frases.',
        userPrompt:
          `INSTRUCCIONES DEL PLAYBOOK:\n${action.instructions}\n\n` +
          `CONTACTO:\n${JSON.stringify(ctx.profileSnapshot)}\n\n` +
          `ÚLTIMOS MENSAJES:\n${ctx.recentMessages}`,
        toolName: 'redactar_seguimiento',
        toolDescription: 'Devuelve el mensaje de seguimiento.',
        toolInputSchema: {
          type: 'object',
          properties: { message: { type: 'string', description: 'El mensaje, listo para enviar.' } },
          required: ['message'],
        },
        maxTokens: DRAFT_MAX_TOKENS,
      });
      void this.ai.recordUsage({
        tenantId,
        feature: 'playbook_draft',
        callResult: call,
        resourceType: 'playbook',
        resourceId: playbook.id,
        metadata: { profileId, cause },
      });

      const draftText = call.result.message?.trim();
      if (!draftText) return this.suppress(tenantId, playbook.id, profileId, 'empty_draft', cause);

      // AUTO respeta la ventana de silencio: fuera de horario degrada a borrador.
      const auto = playbook.mode === 'AUTO' && !this.inQuietHours(rails);

      const run = await this.prisma.withTenant(tenantId, (tx) =>
        tx.playbookRun.create({
          data: {
            tenantId,
            playbookId: playbook.id,
            profileId,
            leadId: ctx.leadId,
            conversationId: ctx.conversationId,
            status: auto ? 'APPROVED' : 'DRAFT',
            draftText,
            meta: { cause, auto } as never,
          },
        }),
      );

      if (auto) {
        await this.deliver(tenantId, run.id, draftText, 'auto');
      }
      this.logger.log(
        { playbook: playbook.name, profileId, runId: run.id, auto },
        'playbook ejecutado',
      );
    } catch (err) {
      this.logger.warn({ err, playbookId: playbook.id, profileId }, 'playbook falló');
      await this.prisma
        .withTenant(tenantId, (tx) =>
          tx.playbookRun.create({
            data: {
              tenantId,
              playbookId: playbook.id,
              profileId,
              status: 'FAILED',
              reason: (err as Error).message.slice(0, 300),
              meta: { cause } as never,
            },
          }),
        )
        .catch(() => undefined);
    }
  }

  private async suppress(
    tenantId: string,
    playbookId: string,
    profileId: string,
    reason: string,
    cause: Record<string, string>,
  ) {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.playbookRun.create({
        data: { tenantId, playbookId, profileId, status: 'SUPPRESSED', reason, meta: { cause } as never },
      }),
    );
  }

  private inQuietHours(rails: PlaybookGuardrails, now = new Date()): boolean {
    const start = rails.quietStartHour ?? 21;
    const end = rails.quietEndHour ?? 9;
    const h = now.getHours();
    return start > end ? h >= start || h < end : h >= start && h < end;
  }

  private async gatherContext(tenantId: string, profileId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: {
          name: true,
          lifecycleState: true,
          custom: true,
          enrichment: true,
          leads: { select: { id: true }, take: 5 },
        },
      });
      const leadIds = profile?.leads.map((l) => l.id) ?? [];
      const conv = leadIds.length
        ? await tx.conversation.findFirst({
            where: { leadId: { in: leadIds }, channel: { not: 'EMAIL' }, status: { not: 'CLOSED' } },
            orderBy: { lastMessageAt: 'desc' },
            select: { id: true, leadId: true },
          })
        : null;
      const messages = conv
        ? await tx.message.findMany({
            where: { conversationId: conv.id },
            orderBy: { createdAt: 'desc' },
            take: 6,
            select: { direction: true, body: true },
          })
        : [];
      return {
        conversationId: conv?.id ?? null,
        leadId: conv?.leadId ?? leadIds[0] ?? null,
        profileSnapshot: {
          name: profile?.name ?? null,
          lifecycleState: profile?.lifecycleState ?? null,
          custom: profile?.custom ?? {},
        },
        recentMessages: messages
          .reverse()
          .map((m) => `${m.direction === 'IN' ? 'Contacto' : 'Nosotros'}: ${(m.body ?? '').slice(0, 300)}`)
          .join('\n'),
      };
    });
  }

  // ---- revisión humana ------------------------------------------------------------

  listRuns(tenantId: string, status?: string) {
    const valid = ['DRAFT', 'APPROVED', 'SENT', 'REJECTED', 'SUPPRESSED', 'FAILED'];
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.playbookRun.findMany({
        where: status && valid.includes(status) ? { status: status as never } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { playbook: { select: { name: true } } },
      }),
    );
  }

  /** Aprobar un borrador (opcionalmente editado) y enviarlo. */
  async approve(
    tenantId: string,
    runId: string,
    opts: { editedText?: string; reviewer: { userId: string; email: string } },
  ) {
    const run = await this.prisma.withTenant(tenantId, (tx) =>
      tx.playbookRun.findUnique({ where: { id: runId } }),
    );
    if (!run) throw new NotFoundError('Ejecución no encontrada');
    if (run.status !== 'DRAFT') throw new BadRequestError('Solo se aprueban borradores');
    const text = (opts.editedText ?? run.draftText ?? '').trim();
    if (!text) throw new BadRequestError('Borrador vacío');

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.playbookRun.update({
        where: { id: runId },
        data: { status: 'APPROVED', reviewedBy: opts.reviewer.email },
      }),
    );
    return this.deliver(tenantId, runId, text, opts.reviewer.email, opts.reviewer);
  }

  async reject(tenantId: string, runId: string, reviewerEmail: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const run = await tx.playbookRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (!run) throw new NotFoundError('Ejecución no encontrada');
      if (run.status !== 'DRAFT') throw new BadRequestError('Solo se rechazan borradores');
      await tx.playbookRun.update({
        where: { id: runId },
        data: { status: 'REJECTED', reviewedBy: reviewerEmail },
      });
      return { ok: true };
    });
  }

  private async deliver(
    tenantId: string,
    runId: string,
    text: string,
    reviewedBy: string,
    actor?: { userId: string; email: string },
  ) {
    const run = await this.prisma.withTenant(tenantId, (tx) =>
      tx.playbookRun.findUnique({ where: { id: runId }, select: { conversationId: true } }),
    );
    if (!run?.conversationId) {
      await this.markRun(tenantId, runId, { status: 'FAILED', reason: 'no_channel' });
      return { ok: false, reason: 'no_channel' };
    }
    try {
      await this.conversations.sendText(tenantId, run.conversationId, text, undefined, undefined, actor);
      await this.markRun(tenantId, runId, {
        status: 'SENT',
        sentText: text,
        sentAt: new Date(),
        reviewedBy,
      });
      return { ok: true, status: 'SENT' };
    } catch (err) {
      await this.markRun(tenantId, runId, {
        status: 'FAILED',
        reason: (err as Error).message.slice(0, 300),
      });
      return { ok: false, reason: 'send_failed' };
    }
  }

  private markRun(tenantId: string, runId: string, data: Record<string, unknown>) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.playbookRun.update({ where: { id: runId }, data: data as never }),
    );
  }
}
