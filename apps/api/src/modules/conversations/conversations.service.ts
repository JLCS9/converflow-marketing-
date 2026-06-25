import { Injectable } from '@nestjs/common';
import { AppError, BadRequestError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { BotRunnerService } from '../bots/bot-runner.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { EmailService, type MailAttachment } from '../email/email.service.js';
import { sanitizeEmailHtml, htmlToText } from '../../common/utils/email-html.js';

const STATUSES = ['PENDING', 'ANSWERED', 'CLOSED'] as const;
type Status = (typeof STATUSES)[number];

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botRunner: BotRunnerService,
    private readonly documents: DocumentsService,
    private readonly email: EmailService,
  ) {}

  list(tenantId: string, opts: { status?: string; limit?: number } = {}) {
    const status = (STATUSES as readonly string[]).includes(opts.status ?? '')
      ? (opts.status as Status)
      : undefined;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.findMany({
        // IM only — email now lives in the dedicated Mail module (/app/mail).
        where: { status, channel: { not: 'EMAIL' } },
        orderBy: { lastMessageAt: 'desc' },
        take: opts.limit ?? 100,
        include: { lead: { select: { id: true, name: true, score: true } } },
      }),
    );
  }

  async counts(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [pending, total] = await Promise.all([
        tx.conversation.count({ where: { status: 'PENDING', channel: { not: 'EMAIL' } } }),
        tx.conversation.count({ where: { channel: { not: 'EMAIL' } } }),
      ]);
      return { pending, total };
    });
  }

  async thread(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, score: true, status: true, company: true } },
          messages: { orderBy: { createdAt: 'asc' }, take: 200 },
        },
      });
      if (!conversation) throw new NotFoundError('Conversación no encontrada');
      return conversation;
    });
  }

  async markRead(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id } });
      if (!conv) throw new NotFoundError('Conversación no encontrada');
      return tx.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    });
  }

  /** Send a text reply through the conversation's channel and record it. */
  async sendText(tenantId: string, id: string, text: string, html?: string, documentIds?: string[]) {
    const conv = await this.requireSendable(tenantId, id);

    // EMAIL supports rich HTML + attachments; other channels are plain text only.
    const isEmail = conv.channel === 'EMAIL';
    const isEmailHtml = isEmail && !!html?.trim();
    const safeHtml = isEmailHtml ? sanitizeEmailHtml(html!.trim()) : undefined;
    let body = (isEmailHtml ? htmlToText(safeHtml!) : text).trim();
    const { attachments, names } = isEmail
      ? await this.resolveAttachments(tenantId, documentIds)
      : { attachments: [] as MailAttachment[], names: [] as string[] };
    if (!body && !safeHtml && attachments.length === 0) throw new BadRequestError('Mensaje vacío');

    let bodyHtml = safeHtml;
    if (names.length) {
      body = `${body}\n\n📎 ${names.join(', ')}`.trim();
      if (bodyHtml) bodyHtml = `${bodyHtml}<p>📎 ${names.map((n) => n).join(', ')}</p>`;
    }

    let sentId: string | undefined;
    if (conv.channel === 'WHATSAPP') {
      try {
        const res = await this.botRunner.sendText(conv.botId, conv.contactJid, body);
        sentId = res.id;
      } catch {
        throw new AppError('INTERNAL', 'No se pudo enviar — ¿el bot sigue conectado?', 502);
      }
    } else if (conv.channel === 'EMAIL') {
      try {
        const res = await this.email.replyToConversation(tenantId, id, body, safeHtml, attachments);
        sentId = res.id;
      } catch {
        throw new AppError('INTERNAL', 'No se pudo enviar el email', 502);
      }
    }
    // WEBCHAT: no transport — the visitor's widget polls and picks up the OUT message.

    return this.recordOutbound(tenantId, id, {
      body,
      bodyHtml,
      waMessageId: sentId,
      preview: body.slice(0, 140),
    });
  }

  /** Resolve stored-document ids into email attachments (presigned URLs). */
  private async resolveAttachments(
    tenantId: string,
    documentIds?: string[],
  ): Promise<{ attachments: MailAttachment[]; names: string[] }> {
    const attachments: MailAttachment[] = [];
    const names: string[] = [];
    for (const docId of (documentIds ?? []).slice(0, 10)) {
      try {
        const d = await this.documents.downloadUrl(tenantId, docId);
        attachments.push({ filename: d.name, path: d.url });
        names.push(d.name);
      } catch {
        /* skip missing/forbidden doc */
      }
    }
    return { attachments, names };
  }

  /**
   * Compose and send a brand-new email (not a reply). Resolves the recipient
   * from a free address or a lead/client, finds/creates the EMAIL conversation,
   * links/creates a lead, sends via the tenant's mailbox, and records the OUT
   * message. Returns the conversation to open.
   */
  async composeEmail(
    tenantId: string,
    input: {
      botId?: string;
      to?: string;
      leadId?: string;
      clientId?: string;
      subject?: string;
      html?: string;
      text?: string;
      documentIds?: string[];
    },
  ) {
    const subject = (input.subject ?? '').trim();
    if (!subject) throw new BadRequestError('Falta el asunto');
    const safeHtml = input.html?.trim() ? sanitizeEmailHtml(input.html.trim()) : undefined;
    let body = (safeHtml ? htmlToText(safeHtml) : (input.text ?? '')).trim();
    const { attachments, names } = await this.resolveAttachments(tenantId, input.documentIds);
    if (!body && !safeHtml && attachments.length === 0) throw new BadRequestError('El mensaje está vacío');
    let bodyHtml = safeHtml;
    if (names.length) {
      body = `${body}\n\n📎 ${names.join(', ')}`.trim();
      if (bodyHtml) bodyHtml = `${bodyHtml}<p>📎 ${names.join(', ')}</p>`;
    }

    const resolved = await this.prisma.withTenant(tenantId, async (tx) => {
      let toEmail = (input.to ?? '').trim().toLowerCase();
      let leadId: string | undefined;
      let name: string | undefined;

      if (input.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
        if (!lead?.email) throw new BadRequestError('El lead no tiene email');
        toEmail = lead.email.toLowerCase();
        leadId = lead.id;
        name = lead.name;
      } else if (input.clientId) {
        const client = await tx.client.findUnique({ where: { id: input.clientId } });
        if (!client?.email) throw new BadRequestError('El cliente no tiene email');
        toEmail = client.email.toLowerCase();
        name = client.name;
      }
      if (!toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
        throw new BadRequestError('Destinatario de email inválido');
      }

      const bot = input.botId
        ? await tx.bot.findFirst({ where: { id: input.botId, channel: 'EMAIL' } })
        : await tx.bot.findFirst({ where: { channel: 'EMAIL' }, orderBy: { createdAt: 'asc' } });
      if (!bot) throw new BadRequestError('No hay ningún bot de email configurado');

      // Link to an existing lead by email, or create one, when none was passed.
      if (!leadId && !input.clientId) {
        let lead = await tx.lead.findFirst({ where: { email: toEmail } });
        if (!lead) {
          lead = await tx.lead.create({
            data: { tenantId, name: name ?? toEmail, email: toEmail, source: 'email', status: 'NEW' },
          });
        }
        leadId = lead.id;
        name = lead.name;
      }

      const existing = await tx.conversation.findUnique({
        where: { tenantId_channel_contactJid: { tenantId, channel: 'EMAIL', contactJid: toEmail } },
      });
      const conv =
        existing ??
        (await tx.conversation.create({
          data: {
            tenantId,
            botId: bot.id,
            channel: 'EMAIL',
            contactJid: toEmail,
            contactName: name ?? toEmail,
            emailSubject: subject,
            leadId,
            status: 'ANSWERED',
          },
        }));
      return { convId: conv.id, botId: bot.id, toEmail, subject };
    });

    let sentId: string | undefined;
    try {
      const res = await this.email.sendViaBot(tenantId, resolved.botId, {
        to: resolved.toEmail,
        subject: resolved.subject,
        text: body,
        html: safeHtml,
        attachments,
      });
      sentId = res.id;
    } catch {
      throw new AppError('INTERNAL', 'No se pudo enviar el email', 502);
    }

    await this.recordOutbound(tenantId, resolved.convId, {
      body,
      bodyHtml,
      waMessageId: sentId,
      preview: body.slice(0, 140),
    });
    return { ok: true, conversationId: resolved.convId };
  }

  /** Send one of the tenant's stored documents via WhatsApp. */
  async sendDocument(tenantId: string, id: string, documentId: string) {
    const conv = await this.requireSendable(tenantId, id);
    if (conv.channel !== 'WHATSAPP') {
      throw new BadRequestError('El envío de documentos solo está disponible en WhatsApp por ahora');
    }
    const doc = await this.documents.downloadUrl(tenantId, documentId); // presigned URL + name + mime

    try {
      await this.botRunner.sendDocument(conv.botId, conv.contactJid, {
        url: doc.url,
        fileName: doc.name,
        mimetype: doc.mimeType,
      });
    } catch {
      throw new AppError('INTERNAL', 'No se pudo enviar el documento — ¿el bot conectado?', 502);
    }

    return this.recordOutbound(tenantId, id, {
      body: `📎 ${doc.name}`,
      mediaType: 'document',
      preview: `📎 ${doc.name}`,
    });
  }

  private async requireSendable(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id } });
      if (!conv) throw new NotFoundError('Conversación no encontrada');
      if (!conv.botId) throw new BadRequestError('La conversación no tiene bot asociado');
      return { botId: conv.botId, contactJid: conv.contactJid, channel: conv.channel };
    });
  }

  private async recordOutbound(
    tenantId: string,
    conversationId: string,
    msg: { body: string; bodyHtml?: string; waMessageId?: string; mediaType?: string; preview: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      // The fromMe echo from Baileys may also arrive; waMessageId dedup in the
      // ingest service prevents a duplicate.
      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          direction: 'OUT',
          waMessageId: msg.waMessageId,
          body: msg.body,
          bodyHtml: msg.bodyHtml ?? null,
          mediaType: msg.mediaType ?? null,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'ANSWERED',
          lastMessageAt: now,
          lastMessagePreview: msg.preview,
          lastOutboundAt: now,
          unreadCount: 0,
        },
      });
      return { ok: true, messageId: message.id };
    });
  }

  async setStatus(tenantId: string, id: string, action: 'close' | 'reopen') {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id } });
      if (!conv) throw new NotFoundError('Conversación no encontrada');
      let status: Status;
      if (action === 'close') {
        status = 'CLOSED';
      } else {
        const inbound = conv.lastInboundAt?.getTime() ?? 0;
        const outbound = conv.lastOutboundAt?.getTime() ?? 0;
        status = outbound >= inbound ? 'ANSWERED' : 'PENDING';
      }
      return tx.conversation.update({ where: { id }, data: { status } });
    });
  }
}
