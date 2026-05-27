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
    // 1. Fetch FULL context in one short transaction:
    //    note + lead/client (with extended fields) + prior analyzed notes +
    //    active opportunities + pending tasks. This is what makes replies
    //    non-repetitive: Claude sees what we already suggested.
    const ctx = await this.prisma.withTenant(tenantId, async (tx) => {
      const note = await tx.note.findUnique({
        where: { id },
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              company: true,
              email: true,
              phone: true,
              source: true,
              status: true,
              score: true,
            },
          },
          client: { select: { id: true, name: true, email: true } },
        },
      });
      if (!note) throw new NotFoundError('Nota no encontrada');

      const priorNotes = await tx.note.findMany({
        where: {
          id: { not: id },
          leadId: note.leadId,
          clientId: note.clientId,
          opportunityId: note.opportunityId,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          body: true,
          aiCategory: true,
          aiSuggestedReply: true,
          aiAnalyzedAt: true,
        },
      });

      // Opportunities tied to the same lead OR client.
      const opportunities = note.leadId
        ? await tx.opportunity.findMany({
            where: { leadId: note.leadId, status: { in: ['OPEN', 'QUOTED', 'NEGOTIATING'] } },
            select: { name: true, status: true, amount: true, probability: true },
          })
        : note.clientId
          ? await tx.opportunity.findMany({
              where: { clientId: note.clientId, status: { in: ['OPEN', 'QUOTED', 'NEGOTIATING'] } },
              select: { name: true, status: true, amount: true, probability: true },
            })
          : [];

      const pendingTasks = await tx.task.findMany({
        where: {
          OR: [
            { leadId: note.leadId || undefined },
            { clientId: note.clientId || undefined },
          ],
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
        orderBy: { dueAt: 'asc' },
        take: 5,
        select: { title: true, type: true, dueAt: true },
      });

      return { note, priorNotes, opportunities, pendingTasks };
    });

    // 2. Claude call OUTSIDE the transaction — can take several seconds.
    const call = await this.ai.classifyNote({
      noteBody: ctx.note.body,
      leadContext: ctx.note.lead
        ? {
            name: ctx.note.lead.name,
            company: ctx.note.lead.company,
            email: ctx.note.lead.email,
            phone: ctx.note.lead.phone,
            source: ctx.note.lead.source,
            status: ctx.note.lead.status,
            score: ctx.note.lead.score,
          }
        : undefined,
      clientContext: ctx.note.client
        ? { name: ctx.note.client.name, email: ctx.note.client.email }
        : undefined,
      priorNotes: ctx.priorNotes.map((n) => ({
        body: n.body,
        category: n.aiCategory,
        suggestedReply: n.aiSuggestedReply,
        analyzedAt: n.aiAnalyzedAt,
      })),
      opportunities: ctx.opportunities.map((o) => ({
        name: o.name,
        status: o.status,
        amount: o.amount?.toString() ?? null,
        probability: o.probability,
      })),
      pendingTasks: ctx.pendingTasks.map((t) => ({
        title: t.title,
        type: t.type,
        dueAt: t.dueAt,
      })),
    });
    // Re-bind for downstream code that still references `note`.
    const note = ctx.note;

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
