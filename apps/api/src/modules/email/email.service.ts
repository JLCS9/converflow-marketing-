import { Injectable, Logger } from '@nestjs/common';
import { AppError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { env } from '../../config/env.js';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return Boolean(env.RESEND_API_KEY);
  }

  /** Low-level send via Resend. `from` uses EMAIL_FROM (must be a verified domain). */
  async send(opts: {
    to: string;
    subject: string;
    text: string;
    fromName?: string;
    replyTo?: string;
    inReplyTo?: string;
  }): Promise<{ id?: string }> {
    if (!env.RESEND_API_KEY) {
      throw new AppError('INTERNAL', 'Email no configurado (falta RESEND_API_KEY)', 503);
    }
    const from = opts.fromName ? `${opts.fromName} <${env.EMAIL_FROM}>` : env.EMAIL_FROM;
    const headers: Record<string, string> = {};
    if (opts.inReplyTo) {
      headers['In-Reply-To'] = opts.inReplyTo;
      headers['References'] = opts.inReplyTo;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        reply_to: opts.replyTo,
        headers: Object.keys(headers).length ? headers : undefined,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(`Resend send failed (${res.status}): ${detail.slice(0, 200)}`);
      throw new AppError('INTERNAL', `Envío de email falló (${res.status})`, 502);
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id };
  }

  /**
   * Reply to an EMAIL conversation: derives recipient, threaded subject,
   * Reply-To (the bot's inbound address) and In-Reply-To from the conversation.
   */
  async replyToConversation(
    tenantId: string,
    conversationId: string,
    text: string,
  ): Promise<{ id?: string }> {
    const conv = await this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.findUnique({
        where: { id: conversationId },
        select: { contactJid: true, emailSubject: true, bot: { select: { phoneNumber: true } } },
      }),
    );
    if (!conv) throw new NotFoundError('Conversación no encontrada');

    const lastIn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.findFirst({
        where: { conversationId, direction: 'IN', waMessageId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { waMessageId: true },
      }),
    );

    const base = conv.emailSubject?.trim();
    const subject = base ? (/^re:/i.test(base) ? base : `Re: ${base}`) : 'Tu consulta';

    return this.send({
      to: conv.contactJid,
      subject,
      text,
      replyTo: conv.bot?.phoneNumber ?? undefined,
      inReplyTo: lastIn?.waMessageId ?? undefined,
    });
  }
}
