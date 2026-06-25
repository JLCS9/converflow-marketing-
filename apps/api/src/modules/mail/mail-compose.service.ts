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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Parse a string ("a@x.com, b@y.com") or array into a deduped, validated, lowercased list. */
export function parseAddressList(v: string | string[] | undefined | null): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,;\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const a = String(raw).trim().toLowerCase();
    if (a && EMAIL_RE.test(a) && !seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Build a forwarded message body: optional intro + quoted original. */
export function buildForwardBody(
  src: { fromName?: string | null; fromAddress?: string | null; subject?: string | null; html?: string | null; text?: string | null; sentAt?: Date | null; receivedAt?: Date | null },
  intro?: string,
): string {
  const when = src.sentAt ?? src.receivedAt ?? null;
  const header =
    `<p>---------- Mensaje reenviado ----------<br>` +
    `De: ${escapeHtml(src.fromName ?? '')} &lt;${escapeHtml(src.fromAddress ?? '')}&gt;<br>` +
    (when ? `Fecha: ${escapeHtml(when.toISOString())}<br>` : '') +
    `Asunto: ${escapeHtml(src.subject ?? '')}</p>`;
  const original = src.html?.trim()
    ? src.html
    : `<pre style="white-space:pre-wrap">${escapeHtml(src.text ?? '')}</pre>`;
  return `${(intro ?? '').trim()}<br>${header}${original}`;
}

@Injectable()
export class MailComposeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MailConnectionsService,
  ) {}

  /** Reply to a thread. To defaults to the last inbound sender; cc/bcc optional (reply-all = caller sets cc). */
  async reply(
    tenantId: string,
    threadId: string,
    actor: Actor,
    input: { html?: string; to?: string | string[]; cc?: string | string[]; bcc?: string | string[] },
  ) {
    const safeHtml = sanitizeEmailHtml((input.html ?? '').trim());
    if (!safeHtml || safeHtml === '<p></p>') throw new BadRequestError('El mensaje está vacío');

    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: threadId } }),
    );
    if (!thread) throw new NotFoundError('Hilo no encontrado');
    const conn = await this.connections.assertAccess(tenantId, thread.connectionId, actor);

    // Last message drives default recipient + RFC threading.
    const last = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findFirst({
        where: { threadId, isDraft: false },
        orderBy: { createdAt: 'desc' },
      }),
    );
    const participants = Array.isArray(thread.participants) ? (thread.participants as string[]) : [];
    const defaultTo = (last?.direction === 'IN' ? last.fromAddress : null) ?? participants[0];
    const explicitTo = parseAddressList(input.to);
    const to = explicitTo.length ? explicitTo : defaultTo ? [defaultTo] : [];
    if (!to.length) throw new BadRequestError('No hay destinatario para responder');
    // cc/bcc minus anyone already in To, minus our own address.
    const self = conn.fromAddress.toLowerCase();
    const cc = parseAddressList(input.cc).filter((a) => a !== self && !to.includes(a));
    const bcc = parseAddressList(input.bcc).filter((a) => a !== self && !to.includes(a));

    const base = normalizeSubject(thread.subject ?? last?.subject ?? '');
    const subject = base ? `Re: ${base}` : 'Re:';
    const inReplyTo = last?.rfcMessageId ?? undefined;
    const references = [last?.references, last?.rfcMessageId].filter(Boolean).join(' ') || undefined;

    const sentId = await this.send(tenantId, conn, { to, cc, bcc, subject, html: safeHtml, inReplyTo, references });

    return this.recordOutbound(tenantId, {
      threadId,
      connectionId: thread.connectionId,
      rfcMessageId: sentId,
      to,
      cc,
      bcc,
      subject,
      html: safeHtml,
      inReplyTo,
      references,
      bumpThread: true,
    });
  }

  /** Compose a brand-new email (opens a new thread). Supports multiple To/Cc/Bcc. */
  async compose(
    tenantId: string,
    connectionId: string,
    actor: Actor,
    input: { to?: string | string[]; cc?: string | string[]; bcc?: string | string[]; subject?: string; html?: string },
  ) {
    const to = parseAddressList(input.to);
    if (!to.length) throw new BadRequestError('Destinatario inválido');
    const subject = (input.subject ?? '').trim();
    if (!subject) throw new BadRequestError('Falta el asunto');
    const safeHtml = sanitizeEmailHtml((input.html ?? '').trim());
    const conn = await this.connections.assertAccess(tenantId, connectionId, actor);
    const self = conn.fromAddress.toLowerCase();
    const cc = parseAddressList(input.cc).filter((a) => a !== self && !to.includes(a));
    const bcc = parseAddressList(input.bcc).filter((a) => a !== self && !to.includes(a));

    const thread = await this.createThread(tenantId, connectionId, subject, [...to, ...cc], safeHtml);

    const sentId = await this.send(tenantId, conn, { to, cc, bcc, subject, html: safeHtml });
    return this.recordOutbound(tenantId, {
      threadId: thread.id,
      connectionId,
      rfcMessageId: sentId,
      to,
      cc,
      bcc,
      subject,
      html: safeHtml,
      bumpThread: false,
    });
  }

  /** Forward an existing message to new recipients (opens a new thread). */
  async forward(
    tenantId: string,
    messageId: string,
    actor: Actor,
    input: { to?: string | string[]; cc?: string | string[]; bcc?: string | string[]; html?: string },
  ) {
    const src = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findUnique({ where: { id: messageId } }),
    );
    if (!src) throw new NotFoundError('Mensaje no encontrado');
    const conn = await this.connections.assertAccess(tenantId, src.connectionId, actor);

    const to = parseAddressList(input.to);
    if (!to.length) throw new BadRequestError('Destinatario inválido');
    const self = conn.fromAddress.toLowerCase();
    const cc = parseAddressList(input.cc).filter((a) => a !== self && !to.includes(a));
    const bcc = parseAddressList(input.bcc).filter((a) => a !== self && !to.includes(a));

    const base = normalizeSubject(src.subject ?? '');
    const subject = base ? `Fwd: ${base}` : 'Fwd:';
    const body = sanitizeEmailHtml(
      buildForwardBody(
        { fromName: src.fromName, fromAddress: src.fromAddress, subject: src.subject, html: src.html, text: src.text, sentAt: src.sentAt, receivedAt: src.receivedAt },
        input.html,
      ),
    );

    const thread = await this.createThread(tenantId, src.connectionId, subject, [...to, ...cc], body);

    const sentId = await this.send(tenantId, conn, { to, cc, bcc, subject, html: body });
    return this.recordOutbound(tenantId, {
      threadId: thread.id,
      connectionId: src.connectionId,
      rfcMessageId: sentId,
      to,
      cc,
      bcc,
      subject,
      html: body,
      bumpThread: false,
    });
  }

  // ---- drafts -------------------------------------------------------------

  /**
   * Create or update a draft. With draftId → update; with threadId → reply draft
   * on that thread; otherwise → new-compose draft (needs connectionId, creates a
   * thread in the DRAFTS folder). Never sends.
   */
  async saveDraft(
    tenantId: string,
    actor: Actor,
    input: {
      draftId?: string;
      threadId?: string;
      connectionId?: string;
      to?: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject?: string;
      html?: string;
    },
  ): Promise<{ draftId: string; threadId: string }> {
    const to = parseAddressList(input.to);
    const cc = parseAddressList(input.cc);
    const bcc = parseAddressList(input.bcc);
    const html = sanitizeEmailHtml((input.html ?? '').trim());
    const subject = (input.subject ?? '').trim();
    const snippet = htmlToText(html).slice(0, 200);

    // Update an existing draft.
    if (input.draftId) {
      const existing = await this.prisma.withTenant(tenantId, (tx) =>
        tx.emailMessage.findUnique({ where: { id: input.draftId } }),
      );
      if (!existing || !existing.isDraft) throw new NotFoundError('Borrador no encontrado');
      await this.connections.assertAccess(tenantId, existing.connectionId, actor);
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.emailMessage.update({
          where: { id: existing.id },
          data: { toAddresses: to, ccAddresses: cc, bccAddresses: bcc, subject, html, text: htmlToText(html), snippet },
        });
        await tx.emailThread.update({
          where: { id: existing.threadId },
          data: { snippet, lastMessageAt: new Date() },
        });
      });
      return { draftId: existing.id, threadId: existing.threadId };
    }

    // New reply draft on an existing thread.
    if (input.threadId) {
      const thread = await this.prisma.withTenant(tenantId, (tx) =>
        tx.emailThread.findUnique({ where: { id: input.threadId } }),
      );
      if (!thread) throw new NotFoundError('Hilo no encontrado');
      await this.connections.assertAccess(tenantId, thread.connectionId, actor);
      const id = await this.createDraftMessage(tenantId, thread.connectionId, thread.id, { to, cc, bcc, subject, html, snippet });
      return { draftId: id, threadId: thread.id };
    }

    // New-compose draft → needs a connection; create a DRAFTS-folder thread.
    if (!input.connectionId) throw new BadRequestError('Falta el buzón');
    await this.connections.assertAccess(tenantId, input.connectionId, actor);
    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.create({
        data: {
          tenantId,
          connectionId: input.connectionId!,
          subject: subject || null,
          participants: [...to, ...cc],
          folder: 'DRAFTS',
          status: 'OPEN',
          snippet,
          lastMessageAt: new Date(),
        },
        select: { id: true },
      }),
    );
    const id = await this.createDraftMessage(tenantId, input.connectionId, thread.id, { to, cc, bcc, subject, html, snippet });
    return { draftId: id, threadId: thread.id };
  }

  async deleteDraft(tenantId: string, draftId: string, actor: Actor) {
    const msg = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findUnique({ where: { id: draftId } }),
    );
    if (!msg || !msg.isDraft) throw new NotFoundError('Borrador no encontrado');
    await this.connections.assertAccess(tenantId, msg.connectionId, actor);
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.emailMessage.delete({ where: { id: msg.id } });
      const thread = await tx.emailThread.findUnique({ where: { id: msg.threadId }, select: { folder: true } });
      const remaining = await tx.emailMessage.count({ where: { threadId: msg.threadId } });
      if (thread?.folder === 'DRAFTS' && remaining === 0) {
        await tx.emailThread.delete({ where: { id: msg.threadId } });
      }
      return { ok: true };
    });
  }

  /** Send a stored draft: dispatches via SMTP and converts the draft into a SENT message. */
  async sendDraft(tenantId: string, draftId: string, actor: Actor) {
    const msg = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findUnique({ where: { id: draftId } }),
    );
    if (!msg || !msg.isDraft) throw new NotFoundError('Borrador no encontrado');
    const conn = await this.connections.assertAccess(tenantId, msg.connectionId, actor);

    const to = parseAddressList(msg.toAddresses as string[] | null);
    if (!to.length) throw new BadRequestError('El borrador no tiene destinatario');
    const cc = parseAddressList(msg.ccAddresses as string[] | null);
    const bcc = parseAddressList(msg.bccAddresses as string[] | null);
    const html = sanitizeEmailHtml((msg.html ?? '').trim());
    if (!html || html === '<p></p>') throw new BadRequestError('El borrador está vacío');

    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: msg.threadId } }),
    );
    // RFC threading if this draft is a reply (thread already has a non-draft message).
    const last = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findFirst({
        where: { threadId: msg.threadId, isDraft: false },
        orderBy: { createdAt: 'desc' },
      }),
    );
    const isReply = !!last;
    const base = normalizeSubject(msg.subject ?? thread?.subject ?? '');
    const subject = (msg.subject ?? '').trim() || (isReply ? (base ? `Re: ${base}` : 'Re:') : base) || '(sin asunto)';
    const inReplyTo = isReply ? last?.rfcMessageId ?? undefined : undefined;
    const references = isReply ? [last?.references, last?.rfcMessageId].filter(Boolean).join(' ') || undefined : undefined;

    const sentId = await this.send(tenantId, conn, { to, cc, bcc, subject, html, inReplyTo, references });

    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      await tx.emailMessage.update({
        where: { id: msg.id },
        data: {
          isDraft: false,
          folder: 'SENT',
          direction: 'OUT',
          rfcMessageId: sentId,
          inReplyTo,
          references,
          subject,
          html,
          text: htmlToText(html),
          snippet: htmlToText(html).slice(0, 200),
          sentAt: now,
        },
      });
      await tx.emailThread.update({
        where: { id: msg.threadId },
        data: {
          lastMessageAt: now,
          snippet: htmlToText(html).slice(0, 200),
          status: 'OPEN',
          ...(thread?.folder === 'DRAFTS' ? { folder: 'INBOX' } : {}),
        },
      });
      return { ok: true, threadId: msg.threadId, messageId: msg.id };
    });
  }

  // ---- internals ----------------------------------------------------------

  private createThread(tenantId: string, connectionId: string, subject: string, participants: string[], html: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.create({
        data: {
          tenantId,
          connectionId,
          subject: normalizeSubject(subject) || subject,
          participants,
          folder: 'INBOX',
          status: 'OPEN',
          snippet: htmlToText(html).slice(0, 200),
          lastMessageAt: new Date(),
        },
        select: { id: true },
      }),
    );
  }

  private async createDraftMessage(
    tenantId: string,
    connectionId: string,
    threadId: string,
    d: { to: string[]; cc: string[]; bcc: string[]; subject: string; html: string; snippet: string },
  ): Promise<string> {
    const msg = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.create({
        data: {
          tenantId,
          threadId,
          connectionId,
          direction: 'OUT',
          isDraft: true,
          folder: 'DRAFTS',
          toAddresses: d.to,
          ccAddresses: d.cc,
          bccAddresses: d.bcc,
          subject: d.subject,
          html: d.html,
          text: htmlToText(d.html),
          snippet: d.snippet,
        },
        select: { id: true },
      }),
    );
    return msg.id;
  }

  private async send(
    tenantId: string,
    conn: { driver: string; fromAddress: string; displayName: string | null; smtpHost: string | null; smtpPort: number | null; imapHost: string | null; imapPort: number | null; username: string | null; secretEnc: string | null; secure: boolean },
    msg: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; inReplyTo?: string; references?: string },
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
        cc: msg.cc && msg.cc.length ? msg.cc : undefined,
        bcc: msg.bcc && msg.bcc.length ? msg.bcc : undefined,
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
      cc?: string[];
      bcc?: string[];
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
          ccAddresses: m.cc ?? [],
          bccAddresses: m.bcc ?? [],
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
