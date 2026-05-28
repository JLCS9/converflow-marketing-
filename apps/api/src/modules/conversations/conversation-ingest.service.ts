import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';

export const whatsappEventSchema = z.object({
  // Ignored for tenant routing — the tenant is derived from the bot (see below).
  tenantId: z.string().cuid().optional(),
  direction: z.enum(['IN', 'OUT']),
  waMessageId: z.string().max(128).optional(),
  contactJid: z.string().min(1).max(128),
  phone: z.string().min(1).max(40), // lead phone value: '+<intl>' (real) or LID digits
  isRealPhone: z.boolean().optional(),
  pushName: z.string().trim().max(120).optional(),
  text: z.string().max(8000).optional(),
  mediaType: z.string().max(40).optional(),
});
export type WhatsappEventInput = z.infer<typeof whatsappEventSchema>;

@Injectable()
export class ConversationIngestService {
  private readonly logger = new Logger(ConversationIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Ingest one WhatsApp message (inbound or outbound-echo). Upserts the
   * conversation, links/creates a lead, appends the Message, and — for inbound
   * text — classifies it with Claude (fire-and-forget). Outbound (fromMe)
   * flips the conversation to ANSWERED.
   */
  async ingestWhatsapp(botId: string, input: unknown) {
    const d = whatsappEventSchema.parse(input);

    // SECURITY: the tenant is resolved from the bot, NEVER trusted from the
    // payload. This guarantees inbound data can only land under the bot's
    // owner tenant — no cross-tenant routing is possible.
    const bot = await this.prisma.bypass((tx) =>
      tx.bot.findUnique({ where: { id: botId }, select: { tenantId: true } }),
    );
    if (!bot) {
      this.logger.warn(`inbound for unknown bot ${botId} — ignored`);
      return { ok: false, reason: 'unknown_bot' };
    }
    const tenantId = bot.tenantId;

    const now = new Date();
    const digits = d.phone.replace(/\D/g, '');
    if (!digits) return { ok: false, reason: 'invalid_phone' };
    const national = digits.length > 9 ? digits.slice(-9) : digits;
    const body = (d.text ?? '').trim();
    const preview = body ? body.slice(0, 140) : d.mediaType ? `[${d.mediaType}]` : '';

    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      // Link (or, for inbound, create) the CRM lead.
      let lead = await tx.lead.findFirst({
        where: { phone: { contains: national } },
        orderBy: { createdAt: 'asc' },
      });
      if (!lead && d.direction === 'IN') {
        lead = await tx.lead.create({
          data: {
            tenantId: tenantId,
            name: d.pushName?.trim() || `WhatsApp ${national}`,
            phone: d.phone,
            source: 'whatsapp',
            status: 'NEW',
          },
        });
      }

      const existing = await tx.conversation.findUnique({
        where: {
          tenantId_channel_contactJid: {
            tenantId: tenantId,
            channel: 'WHATSAPP',
            contactJid: d.contactJid,
          },
        },
      });

      const status = d.direction === 'IN' ? 'PENDING' : 'ANSWERED';
      const conv = existing
        ? await tx.conversation.update({
            where: { id: existing.id },
            data: {
              botId: existing.botId ?? botId,
              leadId: existing.leadId ?? lead?.id ?? null,
              contactName: d.direction === 'IN' && d.pushName ? d.pushName : existing.contactName,
              contactPhone: d.isRealPhone ? d.phone : existing.contactPhone,
              status,
              lastMessageAt: now,
              lastMessagePreview: preview,
              lastInboundAt: d.direction === 'IN' ? now : existing.lastInboundAt,
              lastOutboundAt: d.direction === 'OUT' ? now : existing.lastOutboundAt,
              // Inbound bumps unread; an outbound (our reply) means it's handled → clear it.
              unreadCount: d.direction === 'IN' ? existing.unreadCount + 1 : 0,
            },
          })
        : await tx.conversation.create({
            data: {
              tenantId: tenantId,
              botId,
              channel: 'WHATSAPP',
              contactJid: d.contactJid,
              contactName: d.direction === 'IN' ? (d.pushName ?? null) : null,
              contactPhone: d.isRealPhone ? d.phone : null,
              leadId: lead?.id ?? null,
              status,
              lastMessageAt: now,
              lastMessagePreview: preview,
              lastInboundAt: d.direction === 'IN' ? now : null,
              lastOutboundAt: d.direction === 'OUT' ? now : null,
              unreadCount: d.direction === 'IN' ? 1 : 0,
            },
          });

      // Idempotency: skip if we already stored this WA message id.
      if (d.waMessageId) {
        const dupe = await tx.message.findFirst({
          where: { conversationId: conv.id, waMessageId: d.waMessageId },
        });
        if (dupe) return { conv, message: dupe, dupe: true, lead };
      }

      const message = await tx.message.create({
        data: {
          tenantId: tenantId,
          conversationId: conv.id,
          direction: d.direction,
          waMessageId: d.waMessageId,
          body: body || null,
          mediaType: d.mediaType ?? null,
        },
      });
      return { conv, message, dupe: false, lead };
    });

    this.logger.log(
      `wa ${d.direction} ${national} → conv ${result.conv.id}${result.dupe ? ' (dupe)' : ''}`,
    );

    if (d.direction === 'IN' && body && !result.dupe) {
      void this.classifyMessage(
        tenantId,
        result.conv.id,
        result.message.id,
        body,
        result.lead,
      ).catch((err) => this.logger.warn({ err, messageId: result.message.id }, 'classify failed'));
    }

    return { ok: true, conversationId: result.conv.id, messageId: result.message.id };
  }

  private async classifyMessage(
    tenantId: string,
    conversationId: string,
    messageId: string,
    body: string,
    lead: {
      name: string;
      company: string | null;
      email: string | null;
      phone: string | null;
      source: string | null;
      status: string;
      score: number | null;
    } | null,
  ) {
    // Prior inbound messages for non-repetitive replies (read in its own txn).
    const prior = await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.findMany({
        where: { conversationId, direction: 'IN', id: { not: messageId } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    );

    // Claude call OUTSIDE any transaction (lesson #1).
    const call = await this.ai.classifyNote({
      noteBody: body,
      leadContext: lead
        ? {
            name: lead.name,
            company: lead.company,
            email: lead.email,
            phone: lead.phone,
            source: lead.source,
            status: lead.status,
            score: lead.score,
          }
        : undefined,
      priorNotes: prior.map((m) => ({
        body: m.body ?? '',
        category: m.aiCategory,
        suggestedReply: m.aiSuggestedReply,
        analyzedAt: m.aiAnalyzedAt,
      })),
    });

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.update({
        where: { id: messageId },
        data: {
          aiCategory: call.result.category as never,
          aiSentiment: call.result.sentiment as never,
          aiConfidence: call.result.confidence,
          aiSuggestedReply: call.result.suggestedReply,
          aiAnalyzedAt: new Date(),
        },
      }),
    );

    void this.ai.recordUsage({
      tenantId,
      feature: 'whatsapp_classify',
      callResult: call,
      resourceType: 'message',
      resourceId: messageId,
    });
  }
}
