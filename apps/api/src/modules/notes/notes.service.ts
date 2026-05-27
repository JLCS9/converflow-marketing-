import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createNoteSchema,
  updateNoteSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  list(tenantId: string, opts: { leadId?: string; clientId?: string; opportunityId?: string } = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.note.findMany({
        where: {
          leadId: opts.leadId || undefined,
          clientId: opts.clientId || undefined,
          opportunityId: opts.opportunityId || undefined,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /**
   * List notes that Claude has classified (aiAnalyzedAt not null).
   * Used by the "Historial IA" page so the user can audit every AI-generated
   * suggestion across leads/clients.
   */
  listAnalyzed(tenantId: string, opts: { category?: string; limit?: number } = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.note.findMany({
        where: {
          aiAnalyzedAt: { not: null },
          aiCategory: (opts.category as never) || undefined,
        },
        orderBy: { aiAnalyzedAt: 'desc' },
        take: opts.limit ?? 100,
        include: {
          lead: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
          opportunity: { select: { id: true, name: true } },
        },
      }),
    );
  }

  async create(tenantId: string, authorId: string, input: CreateNoteInput) {
    const data = createNoteSchema.parse(input);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.note.create({
        data: {
          tenantId,
          authorId,
          body: data.body,
          leadId: data.leadId,
          clientId: data.clientId,
          opportunityId: data.opportunityId,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateNoteInput) {
    const data = updateNoteSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const note = await tx.note.findUnique({ where: { id } });
      if (!note) throw new NotFoundError('Nota no encontrada');
      // Editing the body invalidates the AI classification.
      return tx.note.update({
        where: { id },
        data: {
          body: data.body,
          aiCategory: null,
          aiSentiment: null,
          aiConfidence: null,
          aiSuggestedReply: null,
          aiAnalyzedAt: null,
        },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const note = await tx.note.findUnique({ where: { id } });
      if (!note) throw new NotFoundError('Nota no encontrada');
      await tx.note.delete({ where: { id } });
    });
  }

  async analyze(tenantId: string, id: string) {
    // 1. Fetch context (quick transaction).
    const note = await this.prisma.withTenant(tenantId, (tx) =>
      tx.note.findUnique({
        where: { id },
        include: {
          lead: { select: { name: true, company: true, status: true } },
          client: { select: { name: true } },
        },
      }),
    );
    if (!note) throw new NotFoundError('Nota no encontrada');

    const recent = await this.prisma.withTenant(tenantId, (tx) =>
      tx.note.findMany({
        where: {
          id: { not: id },
          leadId: note.leadId,
          clientId: note.clientId,
          opportunityId: note.opportunityId,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { body: true },
      }),
    );

    // 2. Claude call OUTSIDE the transaction — can take several seconds.
    const call = await this.ai.classifyNote({
      noteBody: note.body,
      leadContext: note.lead
        ? { name: note.lead.name, company: note.lead.company, status: note.lead.status }
        : undefined,
      clientContext: note.client ? { name: note.client.name } : undefined,
      recentMessages: recent.map((r) => r.body),
    });

    // 3. Persist result in a fresh quick transaction.
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.note.update({
        where: { id },
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
      feature: 'classify_note',
      callResult: call,
      resourceType: 'note',
      resourceId: id,
      metadata: { category: call.result.category, sentiment: call.result.sentiment },
    });

    return {
      note: updated,
      ai: {
        category: call.result.category,
        categoryReasoning: call.result.categoryReasoning,
        sentiment: call.result.sentiment,
        confidence: call.result.confidence,
        suggestedReply: call.result.suggestedReply,
        model: call.model,
        durationMs: call.durationMs,
        costUsd: call.costUsd,
      },
    };
  }
}
