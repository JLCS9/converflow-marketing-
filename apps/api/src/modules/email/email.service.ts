import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { AppError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { decryptSecret } from '../../common/utils/crypto.js';
import { env } from '../../config/env.js';

interface SmtpConn {
  email: string;
  smtpHost: string;
  smtpPort: number;
  username: string;
  passwordEnc: string;
  secure: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Send via the tenant's own SMTP mailbox. */
  async sendSmtp(
    conn: SmtpConn,
    opts: { to: string; subject: string; text: string; html?: string; inReplyTo?: string },
  ): Promise<{ id?: string }> {
    const transporter = nodemailer.createTransport({
      host: conn.smtpHost,
      port: conn.smtpPort,
      secure: conn.secure,
      auth: { user: conn.username, pass: decryptSecret(conn.passwordEnc) },
    });
    const info = await transporter.sendMail({
      from: conn.email,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      inReplyTo: opts.inReplyTo,
      references: opts.inReplyTo,
    });
    return { id: info.messageId };
  }

  /** Fallback: send via Resend (Converflow system sender). */
  async sendResend(opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    inReplyTo?: string;
  }): Promise<{ id?: string }> {
    if (!env.RESEND_API_KEY) {
      throw new AppError('INTERNAL', 'Email no configurado (falta RESEND_API_KEY)', 503);
    }
    const headers: Record<string, string> = {};
    if (opts.inReplyTo) {
      headers['In-Reply-To'] = opts.inReplyTo;
      headers['References'] = opts.inReplyTo;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
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
   * Send a standalone email through a specific bot's mailbox (campaigns). Uses
   * the bot's CONNECTED SMTP connection; falls back to the Converflow system
   * sender (Resend) when the bot has no connected mailbox. Caller runs this
   * OUTSIDE any Prisma transaction.
   */
  async sendViaBot(
    tenantId: string,
    botId: string | null,
    opts: { to: string; subject: string; text: string; html?: string },
  ): Promise<{ id?: string }> {
    const conn = botId
      ? await this.prisma.withTenant(tenantId, (tx) =>
          tx.emailConnection.findUnique({ where: { botId } }),
        )
      : null;
    if (conn && conn.status === 'CONNECTED') {
      return this.sendSmtp(conn, {
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
    }
    return this.sendResend({
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
  }

  /**
   * Internal notification to a team member (e.g. a support task was assigned).
   * Prefers the tenant's own mailbox (the first CONNECTED EmailConnection) so
   * the message comes from their domain; falls back to the Converflow system
   * sender (Resend) when no mailbox is connected. Best-effort: the caller should
   * run this OUTSIDE any Prisma transaction (SMTP/Resend are slow network I/O).
   */
  async notifyUser(
    tenantId: string,
    opts: { toEmail: string; subject: string; text: string },
  ): Promise<{ id?: string }> {
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailConnection.findFirst({
        where: { status: 'CONNECTED' },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    if (conn) {
      return this.sendSmtp(conn, { to: opts.toEmail, subject: opts.subject, text: opts.text });
    }
    return this.sendResend({ to: opts.toEmail, subject: opts.subject, text: opts.text });
  }

  /**
   * Reply to an EMAIL conversation. Prefers the tenant's own mailbox (SMTP
   * connection on the bot); falls back to Resend if none is connected.
   */
  async replyToConversation(
    tenantId: string,
    conversationId: string,
    text: string,
  ): Promise<{ id?: string }> {
    const conv = await this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.findUnique({
        where: { id: conversationId },
        select: {
          contactJid: true,
          emailSubject: true,
          bot: { select: { phoneNumber: true, emailConnection: true } },
        },
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
    const inReplyTo = lastIn?.waMessageId ?? undefined;

    const conn = conv.bot?.emailConnection;
    if (conn) {
      return this.sendSmtp(conn, { to: conv.contactJid, subject, text, inReplyTo });
    }
    return this.sendResend({
      to: conv.contactJid,
      subject,
      text,
      replyTo: conv.bot?.phoneNumber ?? undefined,
      inReplyTo,
    });
  }
}
