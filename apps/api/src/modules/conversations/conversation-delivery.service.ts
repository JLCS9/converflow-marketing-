import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_AI_DISCLOSURE } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { BotRunnerService } from '../bots/bot-runner.service.js';
import { EmailService } from '../email/email.service.js';

export interface DeliveryResult {
  delivered: boolean;
  outMessageId?: string;
  reason?: 'rate_limited' | 'transport_failed' | 'duplicate' | 'no_bot';
}

/**
 * E1 · Entrega de respuestas de IA — el «chasis» del legado extraído a un
 * servicio compartido: rate-limit por bot (WhatsApp), aviso de IA en el
 * primer OUT de canal externo, transporte por canal, `waMessageId` para el
 * dedupe del eco, e idempotencia dura por `dedupeKey` (imposible la doble
 * respuesta del fallback o de un reintento).
 */
@Injectable()
export class ConversationDeliveryService {
  private readonly logger = new Logger(ConversationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly botRunner: BotRunnerService,
    private readonly email: EmailService,
  ) {}

  async deliver(opts: {
    tenantId: string;
    conversationId: string;
    text: string;
    /** `ai:<inboundMessageId>` — clave de idempotencia de esta entrega. */
    dedupeKey: string;
    /** Aviso de IA del asistente (null = usar el de por defecto). */
    disclosure?: string | null;
  }): Promise<DeliveryResult> {
    const { tenantId, conversationId, dedupeKey } = opts;

    const conv = await this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.findUnique({
        where: { id: conversationId },
        select: { botId: true, contactJid: true, channel: true },
      }),
    );
    if (!conv?.botId) return { delivered: false, reason: 'no_bot' };

    // Idempotencia: si esta entrega ya ocurrió, no repetir NI el transporte.
    const existing = await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.findFirst({ where: { dedupeKey }, select: { id: true } }),
    );
    if (existing) return { delivered: true, outMessageId: existing.id, reason: 'duplicate' };

    // Rate-limit solo en transportes externos con riesgo de baneo (WhatsApp).
    if (conv.channel === 'WHATSAPP' && !(await this.withinRateLimit(tenantId, conv.botId))) {
      this.logger.warn(`entrega rate-limited para bot ${conv.botId}`);
      return { delivered: false, reason: 'rate_limited' };
    }

    // Aviso de IA en el PRIMER OUT de canal externo. El webchat lo muestra
    // fijo en la cabecera del widget, así que ahí nunca se antepone.
    const isWebchat = conv.channel === 'WEBCHAT';
    const priorOut = await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.count({ where: { conversationId, direction: 'OUT' } }),
    );
    const disclosure = (opts.disclosure ?? DEFAULT_AI_DISCLOSURE).trim();
    const text =
      !isWebchat && priorOut === 0 && disclosure ? `${disclosure}\n\n${opts.text}` : opts.text;

    let sentId: string | undefined;
    if (conv.channel === 'WHATSAPP') {
      try {
        const res = await this.botRunner.sendText(conv.botId, conv.contactJid, text);
        sentId = res.id;
      } catch (err) {
        this.logger.warn({ err }, 'entrega WhatsApp falló');
        return { delivered: false, reason: 'transport_failed' };
      }
    } else if (conv.channel === 'EMAIL') {
      try {
        const res = await this.email.replyToConversation(tenantId, conversationId, text);
        sentId = res.id;
      } catch (err) {
        this.logger.warn({ err }, 'entrega email falló');
        return { delivered: false, reason: 'transport_failed' };
      }
    }
    // WEBCHAT: sin transporte — el widget sondea el OUT.

    try {
      const message = await this.prisma.withTenant(tenantId, async (tx) => {
        const now = new Date();
        const msg = await tx.message.create({
          data: {
            tenantId,
            conversationId,
            direction: 'OUT',
            waMessageId: sentId,
            body: text,
            dedupeKey,
          },
          select: { id: true },
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
        return msg;
      });
      return { delivered: true, outMessageId: message.id };
    } catch (err) {
      // Carrera con otra entrega idéntica: el unique de dedupeKey ganó.
      if ((err as { code?: string }).code === 'P2002') {
        return { delivered: true, reason: 'duplicate' };
      }
      throw err;
    }
  }

  /** Modo SUGGEST unificado: la respuesta queda como sugerencia en el IN. */
  async suggest(opts: {
    tenantId: string;
    inboundMessageId: string;
    reply: string;
  }): Promise<void> {
    await this.prisma.withTenant(opts.tenantId, (tx) =>
      tx.message.update({
        where: { id: opts.inboundMessageId },
        data: { aiSuggestedReply: opts.reply, aiAnalyzedAt: new Date() },
      }),
    );
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
}
