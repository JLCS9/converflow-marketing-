import { Injectable } from '@nestjs/common';
import { NotFoundError, BadRequestError, AppError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { decryptSecret } from '../../common/utils/crypto.js';
import { sanitizeEmailHtml, htmlToText } from '../../common/utils/email-html.js';
import { createMailDriver, type DriverConfig } from './drivers/index.js';
import { MailConnectionsService } from './mail-connections.service.js';
import { normalizeSubject } from './mail-ingest.service.js';

interface Actor {
  userId: string;
  role: string;
}

@Injectable()
export class MailComposeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MailConnectionsService,
  ) {}

  /** Reply to a thread (to the last inbound sender), threaded via RFC headers. */
  async reply(tenantId: string, threadId: string, actor: Actor, html: string) {
    const safeHtml = sanitizeEmailHtml((html ?? '').trim());
    if (!safeHtml || safeHtml === '<p></p>') throw new BadRequestError('El mensaje está vacío');

    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: threadId } }),
    );
    if (!thread) throw new NotFoundError('Hilo no encontrado');
    const conn = await this.connections.assertAccess(tenantId, thread.connectionId, actor);

    // Last message drives recipient + RFC threading.
    const last = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findFirst({ where: { threadId }, orderBy: { createdAt: 'desc' } }),
    );
    const participants = Array.isArray(thread.participants) ? (thread.participants as string[]) : [];
    const to = (last?.direction === 'IN' ? last.fromAddress : null) ?? participants[0];
    if (!to) throw new BadRequestError('No hay destinatario para responder');

    const base = normalizeSubject(thread.subject ?? last?.subject ?? '');
    const subject = base ? `Re: ${base}` : 'Re:';
    const inReplyTo = last?.rfcMessageId ?? undefined;
    const references = [last?.references, last?.rfcMessageId].filter(Boolean).join(' ') || undefined;

    const sentId = await this.send(tenantId, conn, {
      to,
      subject,
      html: safeHtml,
      inReplyTo,
      references,
    });

    return this.recordOutbound(tenantId, {
      threadId,
      connectionId: thread.connectionId,
      rfcMessageId: sentId,
      to: [to],
      subject,
      html: safeHtml,
      inReplyTo,
      references,
      bumpThread: true,
    });
  }

  /** Compose a brand-new email (opens a new thread). */
  async compose(
    tenantId: string,
    connectionId: string,
    actor: Actor,
    input: { to?: string; subject?: string; html?: string },
  ) {
    const to = (input.to ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new BadRequestError('Destinatario inválido');
    const subject = (input.subject ?? '').trim();
    if (!subject) throw new BadRequestError('Falta el asunto');
    const safeHtml = sanitizeEmailHtml((input.html ?? '').trim());

    const conn = await this.connections.assertAccess(tenantId, connectionId, actor);

    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.create({
        data: {
          tenantId,
          connectionId,
          subject: normalizeSubject(subject) || subject,
          participants: [to],
          folder: 'INBOX',
          status: 'OPEN',
          snippet: htmlToText(safeHtml).slice(0, 200),
          lastMessageAt: new Date(),
        },
        select: { id: true },
      }),
    );

    const sentId = await this.send(tenantId, conn, { to, subject, html: safeHtml });
    return this.recordOutbound(tenantId, {
      threadId: thread.id,
      connectionId,
      rfcMessageId: sentId,
      to: [to],
      subject,
      html: safeHtml,
      bumpThread: false,
    });
  }

  // ---- internals ----------------------------------------------------------

  private async send(
    tenantId: string,
    conn: { driver: string; fromAddress: string; displayName: string | null; smtpHost: string | null; smtpPort: number | null; imapHost: string | null; imapPort: number | null; username: string | null; secretEnc: string | null; secure: boolean },
    msg: { to: string; subject: string; html: string; inReplyTo?: string; references?: string },
  ): Promise<string | undefined> {
    const cfg: DriverConfig = {
      driver: conn.driver,
      fromAddress: conn.fromAddress,
      displayName: conn.displayName,
      imapHost: conn.imapHost,
      imapPort: conn.imapPort,
      smtpHost: conn.smtpHost,
      smtpPort: conn.smtpPort,
      username: conn.username,
      secret: conn.secretEnc ? decryptSecret(conn.secretEnc) : null,
      secure: conn.secure,
    };
    try {
      const res = await createMailDriver(cfg).send({
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: htmlToText(msg.html),
        inReplyTo: msg.inReplyTo,
        references: msg.references,
      });
      return res.id;
    } catch (err) {
      throw new AppError('INTERNAL', `No se pudo enviar: ${String((err as Error)?.message ?? err).slice(0, 200)}`, 502);
    }
  }

  private recordOutbound(
    tenantId: string,
    m: {
      threadId: string;
      connectionId: string;
      rfcMessageId?: string;
      to: string[];
      subject: string;
      html: string;
      inReplyTo?: string;
      references?: string;
      bumpThread: boolean;
    },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const message = await tx.emailMessage.create({
        data: {
          tenantId,
          threadId: m.threadId,
          connectionId: m.connectionId,
          rfcMessageId: m.rfcMessageId,
          inReplyTo: m.inReplyTo,
          references: m.references,
          direction: 'OUT',
          folder: 'SENT',
          toAddresses: m.to,
          subject: m.subject,
          html: m.html,
          text: htmlToText(m.html),
          snippet: htmlToText(m.html).slice(0, 200),
          sentAt: now,
        },
        select: { id: true },
      });
      await tx.emailThread.update({
        where: { id: m.threadId },
        data: {
          lastMessageAt: now,
          snippet: htmlToText(m.html).slice(0, 200),
          status: 'OPEN',
          ...(m.bumpThread ? { unreadCount: 0 } : {}),
        },
      });
      return { ok: true, threadId: m.threadId, messageId: message.id };
    });
  }
}
