import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { NotesService } from '../notes/notes.service.js';

export const whatsappInboundSchema = z.object({
  tenantId: z.string().cuid(),
  fromPhone: z.string().min(1),
  pushName: z.string().trim().max(120).optional(),
  text: z.string().max(8000).optional(),
});
export type WhatsappInboundInput = z.infer<typeof whatsappInboundSchema>;

@Injectable()
export class InboundService {
  private readonly logger = new Logger(InboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: NotesService,
  ) {}

  /**
   * Handle one inbound WhatsApp message: find-or-create the lead by phone,
   * store the message as a Note, and classify it by reusing NotesService.analyze
   * (fire-and-forget, since Claude is slow). The suggested reply lands on the
   * note for a human to review/send (human-in-the-loop).
   */
  async handleWhatsappInbound(botId: string, input: WhatsappInboundInput) {
    const data = whatsappInboundSchema.parse(input);
    const digits = data.fromPhone.replace(/\D/g, '');
    if (!digits) return { ok: false, reason: 'invalid_phone' };
    const national = digits.length > 9 ? digits.slice(-9) : digits;
    const body = (data.text ?? '').trim();

    // Find-or-create the lead within the tenant (RLS scoped).
    const leadId = await this.prisma.withTenant(data.tenantId, async (tx) => {
      const existing = await tx.lead.findFirst({
        where: { phone: { contains: national } },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) return existing.id;
      const created = await tx.lead.create({
        data: {
          tenantId: data.tenantId,
          name: data.pushName?.trim() || `WhatsApp ${national}`,
          phone: digits,
          source: 'whatsapp',
          status: 'NEW',
        },
      });
      return created.id;
    });

    this.logger.log(
      `inbound from ${national} (tenant ${data.tenantId}) → lead ${leadId}${body ? '' : ' [no text]'}`,
    );

    // No usable text (e.g. media without caption) → lead captured, no note.
    if (!body) return { ok: true, leadId, noteId: null };

    const note = await this.notes.create(data.tenantId, botId, {
      body: body.slice(0, 5000),
      leadId,
    });

    // Classify asynchronously — don't block the webhook on a 5-15s Claude call.
    void this.notes
      .analyze(data.tenantId, note.id)
      .catch((err) => this.logger.warn({ err, noteId: note.id }, 'inbound classify failed'));

    return { ok: true, leadId, noteId: note.id };
  }
}
