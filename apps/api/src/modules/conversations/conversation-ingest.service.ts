import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { AgentRuntimeService } from '../agents/agent-runtime.service.js';

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
    private readonly agentRuntime: AgentRuntimeService,
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
      tx.bot.findUnique({ where: { id: botId }, select: { tenantId: true, agentId: true } }),
    );
    if (!bot) {
      this.logger.warn(`inbound for unknown bot ${botId} — ignored`);
      return { ok: false, reason: 'unknown_bot' };
    }
    const tenantId = bot.tenantId;
    const agentId = bot.agentId;

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
      this.dispatchInbound(tenantId, agentId, result.conv.id, result.message.id, body, result.lead);
    }

    return { ok: true, conversationId: result.conv.id, messageId: result.message.id };
  }

  /**
   * Ingest one inbound web-chat message from the embeddable widget. The bot
   * (channel WEBCHAT) is the widget; the visitor session id is the contact key.
   */
  /**
   * Pre-chat "intake" step from the widget. Registers a Lead (with name + email)
   * and opens a Conversation BEFORE the visitor sends their first message. The
   * Conversation starts in CLOSED status so it doesn't pollute the inbox until
   * the visitor actually speaks. As soon as ingestWebchat receives a message
   * the same Conversation flips to PENDING.
   */
  async startWebchat(
    botId: string,
    input: { sessionId: string; name: string; email?: string; phone?: string },
  ) {
    const bot = await this.prisma.bypass((tx) =>
      tx.bot.findUnique({
        where: { id: botId },
        select: { tenantId: true, channel: true },
      }),
    );
    if (!bot || bot.channel !== 'WEBCHAT') return { ok: false as const, reason: 'unknown_widget' };

    const tenantId = bot.tenantId;
    const sessionId = input.sessionId.slice(0, 128);
    const name = input.name.trim().slice(0, 150);
    const email = input.email?.trim().toLowerCase().slice(0, 254) || undefined;
    const phone = input.phone?.trim().slice(0, 40) || undefined;
    if (!sessionId || !name) return { ok: false as const, reason: 'invalid_input' };

    await this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.conversation.findUnique({
        where: { tenantId_channel_contactJid: { tenantId, channel: 'WEBCHAT', contactJid: sessionId } },
      });
      let leadId = existing?.leadId ?? null;
      if (!leadId) {
        const matched = email ? await tx.lead.findFirst({ where: { email } }) : null;
        const lead =
          matched ??
          (await tx.lead.create({
            data: { tenantId, name, email, phone, source: 'webchat', status: 'NEW' },
          }));
        leadId = lead.id;
      } else if (email || phone) {
        // Backfill any fields that were empty.
        const lead = await tx.lead.findUnique({ where: { id: leadId } });
        if (lead) {
          await tx.lead.update({
            where: { id: leadId },
            data: {
              email: lead.email ?? email,
              phone: lead.phone ?? phone,
              name: lead.name === 'Visitante web' ? name : lead.name,
            },
          });
        }
      }

      if (existing) {
        await tx.conversation.update({
          where: { id: existing.id },
          data: {
            botId: existing.botId ?? botId,
            leadId,
            contactName: name,
          },
        });
      } else {
        await tx.conversation.create({
          data: {
            tenantId,
            botId,
            channel: 'WEBCHAT',
            contactJid: sessionId,
            contactName: name,
            leadId,
            status: 'CLOSED', // becomes PENDING on the first inbound message
          },
        });
      }
    });

    return { ok: true as const };
  }

  async ingestWebchat(
    botId: string,
    input: { sessionId: string; text: string; visitorName?: string; visitorEmail?: string },
  ) {
    const bot = await this.prisma.bypass((tx) =>
      tx.bot.findUnique({
        where: { id: botId },
        select: { tenantId: true, agentId: true, channel: true },
      }),
    );
    if (!bot || bot.channel !== 'WEBCHAT') return { ok: false, reason: 'unknown_widget' };

    const tenantId = bot.tenantId;
    const sessionId = input.sessionId.slice(0, 128);
    const body = (input.text ?? '').trim();
    if (!body) return { ok: false, reason: 'empty' };
    const visitorName = input.visitorName?.trim();
    const visitorEmail = input.visitorEmail?.trim().toLowerCase() || undefined;
    const now = new Date();
    const preview = body.slice(0, 140);

    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.conversation.findUnique({
        where: { tenantId_channel_contactJid: { tenantId, channel: 'WEBCHAT', contactJid: sessionId } },
      });

      let leadId = existing?.leadId ?? null;
      if (!leadId) {
        const matched = visitorEmail ? await tx.lead.findFirst({ where: { email: visitorEmail } }) : null;
        const lead =
          matched ??
          (await tx.lead.create({
            data: {
              tenantId,
              name: visitorName || 'Visitante web',
              email: visitorEmail,
              source: 'webchat',
              status: 'NEW',
            },
          }));
        leadId = lead.id;
      }

      const conv = existing
        ? await tx.conversation.update({
            where: { id: existing.id },
            data: {
              botId: existing.botId ?? botId,
              leadId,
              contactName: visitorName || existing.contactName,
              status: 'PENDING',
              lastMessageAt: now,
              lastMessagePreview: preview,
              lastInboundAt: now,
              unreadCount: existing.unreadCount + 1,
            },
          })
        : await tx.conversation.create({
            data: {
              tenantId,
              botId,
              channel: 'WEBCHAT',
              contactJid: sessionId,
              contactName: visitorName || 'Visitante web',
              leadId,
              status: 'PENDING',
              lastMessageAt: now,
              lastMessagePreview: preview,
              lastInboundAt: now,
              unreadCount: 1,
            },
          });

      const message = await tx.message.create({
        data: { tenantId, conversationId: conv.id, direction: 'IN', body },
      });
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      return { conv, message, lead };
    });

    this.dispatchInbound(tenantId, bot.agentId, result.conv.id, result.message.id, body, result.lead);
    return { ok: true, conversationId: result.conv.id, messageId: result.message.id };
  }

  /**
   * Ingest one inbound email (from a provider's inbound webhook). The tenant +
   * agent are derived from the EMAIL bot whose address matches the recipient.
   */
  async ingestEmail(input: {
    to?: string;
    from?: string;
    fromName?: string;
    subject?: string;
    text?: string;
    messageId?: string;
  }) {
    const to = (input.to ?? '').trim().toLowerCase();
    const from = (input.from ?? '').trim().toLowerCase();
    if (!to || !from) return { ok: false, reason: 'bad_payload' };

    const bot = await this.prisma.bypass((tx) =>
      tx.bot.findFirst({
        where: { channel: 'EMAIL', phoneNumber: to },
        select: { id: true, tenantId: true, agentId: true },
      }),
    );
    if (!bot) {
      this.logger.warn(`email inbound to unknown address ${to} — ignored`);
      return { ok: false, reason: 'unknown_address' };
    }

    const tenantId = bot.tenantId;
    const subject = (input.subject ?? '').slice(0, 300);
    const body = (input.text ?? '').trim();
    const now = new Date();
    const preview = (body || subject).slice(0, 140);

    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      let lead = await tx.lead.findFirst({ where: { email: from } });
      if (!lead) {
        lead = await tx.lead.create({
          data: {
            tenantId,
            name: input.fromName?.trim() || from,
            email: from,
            source: 'email',
            status: 'NEW',
          },
        });
      }

      const existing = await tx.conversation.findUnique({
        where: { tenantId_channel_contactJid: { tenantId, channel: 'EMAIL', contactJid: from } },
      });
      const conv = existing
        ? await tx.conversation.update({
            where: { id: existing.id },
            data: {
              botId: existing.botId ?? bot.id,
              leadId: existing.leadId ?? lead.id,
              contactName: input.fromName?.trim() || existing.contactName,
              emailSubject: existing.emailSubject ?? (subject || null),
              status: 'PENDING',
              lastMessageAt: now,
              lastMessagePreview: preview,
              lastInboundAt: now,
              unreadCount: existing.unreadCount + 1,
            },
          })
        : await tx.conversation.create({
            data: {
              tenantId,
              botId: bot.id,
              channel: 'EMAIL',
              contactJid: from,
              contactName: input.fromName?.trim() || from,
              emailSubject: subject || null,
              leadId: lead.id,
              status: 'PENDING',
              lastMessageAt: now,
              lastMessagePreview: preview,
              lastInboundAt: now,
              unreadCount: 1,
            },
          });

      if (input.messageId) {
        const dupe = await tx.message.findFirst({
          where: { conversationId: conv.id, waMessageId: input.messageId },
        });
        if (dupe) return { conv, message: dupe, dupe: true, lead };
      }
      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId: conv.id,
          direction: 'IN',
          waMessageId: input.messageId,
          body: body || subject || null,
        },
      });
      return { conv, message, dupe: false, lead };
    });

    this.logger.log(`email IN from ${from} → conv ${result.conv.id}${result.dupe ? ' (dupe)' : ''}`);
    if (body && !result.dupe) {
      this.dispatchInbound(tenantId, bot.agentId, result.conv.id, result.message.id, body, result.lead);
    }
    return { ok: true, conversationId: result.conv.id, messageId: result.message.id };
  }

  /** Public: messages of a web-chat session, for the widget to poll. */
  async getWebchatMessages(botId: string, sessionId: string) {
    const bot = await this.prisma.bypass((tx) =>
      tx.bot.findUnique({ where: { id: botId }, select: { tenantId: true, channel: true } }),
    );
    if (!bot || bot.channel !== 'WEBCHAT' || !sessionId) return { messages: [] };
    return this.prisma.withTenant(bot.tenantId, async (tx) => {
      const conv = await tx.conversation.findUnique({
        where: {
          tenantId_channel_contactJid: {
            tenantId: bot.tenantId,
            channel: 'WEBCHAT',
            contactJid: sessionId.slice(0, 128),
          },
        },
        select: { id: true },
      });
      if (!conv) return { messages: [] };
      const messages = await tx.message.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: { id: true, direction: true, body: true, createdAt: true },
      });
      return { messages };
    });
  }

  /** Run the assigned agent (tools + reply) or fall back to generic classification. */
  private dispatchInbound(
    tenantId: string,
    agentId: string | null,
    conversationId: string,
    messageId: string,
    body: string,
    lead: {
      id: string;
      name: string;
      company: string | null;
      status: string;
      score: number | null;
      email: string | null;
      phone: string | null;
      source: string | null;
    } | null,
  ) {
    const fallbackClassify = () =>
      void this.classifyMessage(tenantId, conversationId, messageId, body, lead).catch((err) =>
        this.logger.warn({ err, messageId }, 'classify failed'),
      );

    if (agentId) {
      void this.agentRuntime
        .runForMessage({
          tenantId,
          agentId,
          conversationId,
          messageId,
          userText: body,
          lead: lead
            ? { id: lead.id, name: lead.name, company: lead.company, status: lead.status, score: lead.score }
            : null,
        })
        .catch((err) => {
          this.logger.warn({ err, agentId }, 'agent run failed — falling back to classify');
          fallbackClassify();
        });
    } else {
      fallbackClassify();
    }
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
