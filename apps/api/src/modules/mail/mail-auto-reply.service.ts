import { Injectable, Logger } from '@nestjs/common';
import { isAutomatedSender, AppError, BadRequestError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { AiBudgetService } from '../../common/ai/ai-budget.service.js';
import { ConversationEngineService } from '../conversation-engine/conversation-engine.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { MailComposeService } from './mail-compose.service.js';
import { canAccessConnection } from './mail-connections.service.js';
import { gatherCrmContext, crmContextBlock } from './mail-crm-context.js';
import type { ParsedEmail } from './drivers/mail-driver.js';

/** TTL del lock blando del inbox (mismo valor que mail-shared). */
const LOCK_TTL_MS = 60_000;
/** Cap anti-loop: máximas respuestas del Asistente por hilo en 24 h. */
const MAX_AI_REPLIES_PER_THREAD_24H = 3;
/** Rate-limit por buzón (in-process, ventana 60 s). */
const MAX_PER_MAILBOX_PER_MIN = 6;
const HISTORY_MESSAGES = 8;
const HISTORY_CHARS = 1200;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Texto plano del motor → HTML de correo sencillo (+firma del buzón). */
export function renderReplyHtml(text: string, signature?: string | null): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return signature?.trim() ? `${paragraphs}${signature}` : paragraphs;
}

/**
 * Atención autónoma · Adaptador de MAIL del servicio transversal: el MISMO
 * cerebro (engine.respond con Conocimiento + ficha CRM), la MISMA política
 * de modos (OFF/SUGGEST/AUTO por buzón) y las MISMAS guardas que los canales
 * de bots. Best-effort: jamás lanza ni bloquea la ingesta; todo el I/O
 * (Claude + SMTP) fuera de withTenant.
 */
@Injectable()
export class MailAutoReplyService {
  private readonly logger = new Logger(MailAutoReplyService.name);
  private readonly mailboxWindow = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly budget: AiBudgetService,
    private readonly engine: ConversationEngineService,
    private readonly profiles: ProfilesService,
    private readonly compose: MailComposeService,
  ) {}

  async maybeRespond(
    tenantId: string,
    o: { connectionId: string; threadId: string; messageId: string; email: ParsedEmail },
  ): Promise<void> {
    try {
      await this.run(tenantId, o);
    } catch (err) {
      this.logger.warn({ err, threadId: o.threadId }, 'auto-respuesta de correo falló');
    }
  }

  private async run(
    tenantId: string,
    o: { connectionId: string; threadId: string; messageId: string; email: ParsedEmail },
  ): Promise<void> {
    // ---- Guardas BARATAS antes de gastar un solo token -----------------------
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.findUnique({
        where: { id: o.connectionId },
        select: { aiReplyMode: true, signature: true, fromAddress: true },
      }),
    );
    if (!conn || conn.aiReplyMode === 'OFF') return this.skip(o.threadId, 'modo OFF en el buzón');

    if (!(await this.budget.inboundAnalysisEnabled(tenantId))) {
      return this.skip(o.threadId, 'análisis de entrantes desactivado en el tenant (Configuración → IA)');
    }
    await this.budget.assertWithinBudget(tenantId);

    const from = (o.email.fromAddress ?? '').toLowerCase();
    if (!from) return this.skip(o.threadId, 'sin remitente');
    if (o.email.autoSubmitted || isAutomatedSender(from)) {
      return this.skip(o.threadId, `remitente automatizado (${from})`);
    }
    if (from === conn.fromAddress.toLowerCase()) return this.skip(o.threadId, 'eco del propio buzón');

    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({
        where: { id: o.threadId },
        select: { assigneeUserId: true, lockedByUserId: true, lockedAt: true },
      }),
    );
    if (!thread) return;

    // Lock humano fresco: alguien tiene el hilo abierto AHORA.
    if (
      thread.lockedByUserId &&
      thread.lockedAt &&
      Date.now() - thread.lockedAt.getTime() < LOCK_TTL_MS
    ) {
      return this.skip(o.threadId, 'una persona tiene el hilo abierto');
    }

    const dedupeKey = `ai-reply:${o.messageId}`;
    const [already, outAfter, aiLast24h, inbound] = await this.prisma.withTenant(
      tenantId,
      async (tx) => {
        const inMsg = await tx.emailMessage.findUnique({
          where: { id: o.messageId },
          select: { createdAt: true, text: true, subject: true, detectedLang: true },
        });
        return Promise.all([
          tx.emailMessage.findFirst({ where: { dedupeKey }, select: { id: true } }),
          inMsg
            ? tx.emailMessage.findFirst({
                where: {
                  threadId: o.threadId,
                  direction: 'OUT',
                  isDraft: false,
                  createdAt: { gt: inMsg.createdAt },
                },
                select: { id: true },
              })
            : null,
          tx.emailMessage.count({
            where: {
              threadId: o.threadId,
              sentByAi: true,
              isDraft: false,
              createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) },
            },
          }),
          inMsg,
        ]);
      },
    );
    if (!inbound) return;
    if (already) return this.skip(o.threadId, 'ya procesado (idempotencia)');
    if (outAfter) return this.skip(o.threadId, 'ya hay una respuesta posterior al entrante');
    if (aiLast24h >= MAX_AI_REPLIES_PER_THREAD_24H) {
      this.logger.warn({ threadId: o.threadId }, 'cap anti-loop del hilo alcanzado');
      return;
    }

    // Guard humano unificado: si el ASIGNADO respondió en 24h, degradar a borrador.
    let mode: 'SUGGEST' | 'AUTO' = conn.aiReplyMode === 'AUTO' ? 'AUTO' : 'SUGGEST';
    if (mode === 'AUTO' && thread.assigneeUserId) {
      const humanOut = await this.prisma.withTenant(tenantId, (tx) =>
        tx.emailMessage.findFirst({
          where: {
            threadId: o.threadId,
            direction: 'OUT',
            sentByUserId: thread.assigneeUserId,
            createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) },
          },
          select: { id: true },
        }),
      );
      if (humanOut) mode = 'SUGGEST';
    }

    if (!this.withinMailboxRate(o.connectionId)) {
      this.logger.warn({ connectionId: o.connectionId }, 'rate-limit del buzón');
      return;
    }

    // ---- Contexto y generación (I/O fuera de withTenant) ---------------------
    const text = (inbound.text ?? '').trim() || (o.email.snippet ?? '');
    if (text.length < 3) return this.skip(o.threadId, 'entrante sin texto utilizable');

    const res = await this.generate(tenantId, {
      threadId: o.threadId,
      excludeMessageId: o.messageId,
      text,
      from,
      fromName: o.email.fromName ?? null,
      detectedLang: inbound.detectedLang ?? null,
    });

    // ---- Entrega según modo ---------------------------------------------------
    const html = renderReplyHtml(res.reply, conn.signature);
    let delivered = false;
    if (mode === 'AUTO' && res.canAnswer) {
      try {
        await this.compose.replyAsAssistant(tenantId, o.threadId, {
          html,
          dedupeKey,
          markPending: true,
        });
        delivered = true;
      } catch (err) {
        // Fase 2: el texto YA está generado — degradar a borrador, jamás
        // re-generar (mismo principio que la entrega de conversaciones).
        this.logger.warn({ err, threadId: o.threadId }, 'SMTP falló — borrador');
        await this.compose
          .saveAssistantDraft(tenantId, o.threadId, { html })
          .catch(() => undefined);
      }
    } else {
      // SUGGEST, degradado, o el motor NO SABE (canAnswer=false → la laguna
      // ya quedó registrada por el motor; el hilo sigue OPEN para el equipo).
      await this.compose.saveAssistantDraft(tenantId, o.threadId, { html }).catch(() => undefined);
    }

    void this.ai.recordUsage({
      tenantId,
      feature: 'conversation_engine',
      callResult: { ...res.usage, result: res.reply } as never,
      resourceType: 'email_thread',
      resourceId: o.threadId,
      metadata: {
        channel: 'EMAIL',
        mode,
        delivered,
        canAnswer: res.canAnswer,
        extracted: res.extractedKeys,
        gap: Boolean(res.gapId),
        sources: res.sources,
        actions: [],
      },
    });
    this.logger.log(
      { threadId: o.threadId, mode, delivered, canAnswer: res.canAnswer },
      'auto-respuesta de correo procesada',
    );
  }

  /**
   * Botón «Proponer respuesta» del compositor: el MISMO cerebro que la
   * auto-respuesta (Conocimiento + ficha CRM + identidad), bajo demanda.
   * Se salta las guardas de política (modo del buzón, idempotencia, remitente
   * automatizado): las guardas protegen decisiones AUTOMÁTICAS y aquí hay una
   * persona pidiéndolo explícitamente. Presupuesto y rate-limit sí aplican.
   * Nunca envía ni toca el estado del hilo: el resultado va al compositor.
   */
  async propose(
    tenantId: string,
    threadId: string,
    actor: { userId: string; role: string },
  ): Promise<{ html: string; canAnswer: boolean }> {
    const data = await this.prisma.withTenant(tenantId, async (tx) => {
      const thread = await tx.emailThread.findUnique({
        where: { id: threadId },
        select: { connectionId: true },
      });
      if (!thread) return null;
      const conn = await tx.mailConnection.findUnique({
        where: { id: thread.connectionId },
        select: {
          id: true,
          signature: true,
          visibility: true,
          ownerUserId: true,
          memberUserIds: true,
        },
      });
      const lastIn = await tx.emailMessage.findFirst({
        where: { threadId, direction: 'IN', isDraft: false },
        orderBy: { createdAt: 'desc' },
        select: { id: true, text: true, detectedLang: true, fromAddress: true, fromName: true },
      });
      return { conn, lastIn };
    });
    if (!data?.conn) throw new NotFoundError('Hilo no encontrado');
    if (!canAccessConnection(data.conn, actor)) throw new NotFoundError('Hilo no encontrado');
    if (!data.lastIn) {
      throw new BadRequestError('No hay ningún mensaje del contacto que responder');
    }
    const text = (data.lastIn.text ?? '').trim();
    if (text.length < 3) {
      throw new BadRequestError('El último mensaje del contacto no tiene texto que responder');
    }

    await this.budget.assertWithinBudget(tenantId);
    if (!this.withinMailboxRate(data.conn.id)) {
      throw new AppError(
        'CONFLICT',
        'El Asistente está atendiendo muchos correos de este buzón ahora mismo. Espera un momento y vuelve a intentarlo.',
        429,
      );
    }

    const res = await this.generate(tenantId, {
      threadId,
      excludeMessageId: data.lastIn.id,
      text,
      from: (data.lastIn.fromAddress ?? '').toLowerCase(),
      fromName: data.lastIn.fromName ?? null,
      detectedLang: data.lastIn.detectedLang ?? null,
    });

    void this.ai.recordUsage({
      tenantId,
      feature: 'conversation_engine',
      callResult: { ...res.usage, result: res.reply } as never,
      resourceType: 'email_thread',
      resourceId: threadId,
      metadata: {
        channel: 'EMAIL',
        mode: 'MANUAL',
        delivered: false,
        canAnswer: res.canAnswer,
        extracted: res.extractedKeys,
        gap: Boolean(res.gapId),
        sources: res.sources,
        actions: [],
      },
    });

    return { html: renderReplyHtml(res.reply, data.conn.signature), canAnswer: res.canAnswer };
  }

  /** Contexto (historial + CRM + perfil) y llamada al motor transversal. */
  private async generate(
    tenantId: string,
    o: {
      threadId: string;
      excludeMessageId: string;
      text: string;
      from: string;
      fromName: string | null;
      detectedLang: string | null;
    },
  ) {
    const [history, crm, profile] = await Promise.all([
      this.prisma.withTenant(tenantId, (tx) =>
        tx.emailMessage.findMany({
          where: { threadId: o.threadId, isDraft: false, id: { not: o.excludeMessageId } },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_MESSAGES,
          select: { direction: true, text: true },
        }),
      ),
      gatherCrmContext(this.prisma, tenantId, o.from || null),
      o.from
        ? this.profiles
            .resolveForEvent(tenantId, { email: o.from }, { name: o.fromName ?? undefined, source: 'email' })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    return this.engine.respond(tenantId, {
      channel: 'EMAIL',
      text: o.text.slice(0, 4000),
      history: history
        .reverse()
        .map((m) => ({ direction: m.direction as 'IN' | 'OUT', body: (m.text ?? '').slice(0, HISTORY_CHARS) })),
      profileId: profile?.id ?? null,
      leadWaiting: true,
      identity: { tone: null, language: o.detectedLang },
      extraContext: crmContextBlock(crm),
    });
  }

  /** Motivo del salto SIEMPRE en logs: es lo único que permite diagnosticar
   *  en producción por qué «no propone nada» (guardas silenciosas). */
  private skip(threadId: string, reason: string): void {
    this.logger.log({ threadId, reason }, `auto-respuesta saltada: ${reason}`);
  }

  private withinMailboxRate(connectionId: string): boolean {
    const now = Date.now();
    const window = (this.mailboxWindow.get(connectionId) ?? []).filter((t) => now - t < 60_000);
    if (window.length >= MAX_PER_MAILBOX_PER_MIN) return false;
    window.push(now);
    this.mailboxWindow.set(connectionId, window);
    return true;
  }
}
