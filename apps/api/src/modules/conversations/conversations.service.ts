import { Injectable } from '@nestjs/common';
import { AppError, BadRequestError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { BotRunnerService } from '../bots/bot-runner.service.js';
import { DocumentsService } from '../documents/documents.service.js';

const STATUSES = ['PENDING', 'ANSWERED', 'CLOSED'] as const;
type Status = (typeof STATUSES)[number];

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botRunner: BotRunnerService,
    private readonly documents: DocumentsService,
  ) {}

  list(tenantId: string, opts: { status?: string; limit?: number } = {}) {
    const status = (STATUSES as readonly string[]).includes(opts.status ?? '')
      ? (opts.status as Status)
      : undefined;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.findMany({
        where: { status },
        orderBy: { lastMessageAt: 'desc' },
        take: opts.limit ?? 100,
        include: { lead: { select: { id: true, name: true, score: true } } },
      }),
    );
  }

  async counts(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [pending, total] = await Promise.all([
        tx.conversation.count({ where: { status: 'PENDING' } }),
        tx.conversation.count(),
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

  /** Send a text reply via the bot-runner and record it as an OUT message. */
  async sendText(tenantId: string, id: string, text: string) {
    const body = text.trim();
    if (!body) throw new BadRequestError('Mensaje vacío');
    const conv = await this.requireSendable(tenantId, id);

    let sentId: string | undefined;
    try {
      const res = await this.botRunner.sendText(conv.botId, conv.contactJid, body);
      sentId = res.id;
    } catch {
      throw new AppError('INTERNAL', 'No se pudo enviar — ¿el bot sigue conectado?', 502);
    }

    return this.recordOutbound(tenantId, id, { body, waMessageId: sentId, preview: body.slice(0, 140) });
  }

  /** Send one of the tenant's stored documents via WhatsApp. */
  async sendDocument(tenantId: string, id: string, documentId: string) {
    const conv = await this.requireSendable(tenantId, id);
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
      return { botId: conv.botId, contactJid: conv.contactJid };
    });
  }

  private async recordOutbound(
    tenantId: string,
    conversationId: string,
    msg: { body: string; waMessageId?: string; mediaType?: string; preview: string },
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
