import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createLeadSchema,
  importLeadsSchema,
  updateLeadSchema,
  type CreateLeadInput,
  type ImportLeadsInput,
  type UpdateLeadInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';

interface ScoreLeadOutput {
  score: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
  recommendedActions: string[];
}

interface ListOpts {
  status?: string;
  ownerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  list(tenantId: string, opts: ListOpts = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findMany({
        where: {
          status: (opts.status as never) || undefined,
          ownerId: opts.ownerId || undefined,
          OR: opts.search
            ? [
                { name: { contains: opts.search, mode: 'insensitive' } },
                { email: { contains: opts.search, mode: 'insensitive' } },
                { company: { contains: opts.search, mode: 'insensitive' } },
              ]
            : undefined,
        },
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 100,
        skip: opts.offset ?? 0,
      }),
    );
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id },
        include: {
          client: true,
          opportunities: { orderBy: { createdAt: 'desc' } },
          tasks: { orderBy: { dueAt: 'asc' } },
          notes: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!lead) throw new NotFoundError('Lead no encontrado');
      return lead;
    });
  }

  async create(tenantId: string, input: CreateLeadInput) {
    const data = createLeadSchema.parse(input);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.create({
        data: {
          tenantId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          company: data.company,
          source: data.source ?? 'manual',
          status: data.status,
          ownerId: data.ownerId,
          customFields: (data.customFields as never) ?? undefined,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateLeadInput) {
    const data = updateLeadSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundError('Lead no encontrado');

      // Auto-stamp transitions
      const now = new Date();
      const dataWithStamps = {
        ...data,
        customFields: data.customFields !== undefined ? (data.customFields as never) : undefined,
        contactedAt:
          !lead.contactedAt && data.status && data.status !== 'NEW' ? now : undefined,
        qualifiedAt:
          !lead.qualifiedAt && data.status === 'QUALIFIED' ? now : undefined,
      };
      return tx.lead.update({ where: { id }, data: dataWithStamps });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundError('Lead no encontrado');
      await tx.lead.delete({ where: { id } });
    });
  }

  async score(tenantId: string, id: string) {
    // 1. Fetch lead + notes (quick transaction).
    const lead = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findUnique({
        where: { id },
        include: { notes: { orderBy: { createdAt: 'desc' }, take: 20 } },
      }),
    );
    if (!lead) throw new NotFoundError('Lead no encontrado');

    const noteSummary = lead.notes.length
      ? lead.notes
          .map((n) => `- [${n.createdAt.toISOString().slice(0, 10)}] ${n.body.slice(0, 200)}`)
          .join('\n')
      : '(sin notas)';

    const customFields = lead.customFields
      ? JSON.stringify(lead.customFields, null, 2)
      : '(sin campos)';

    const userPrompt = [
      'Analiza este lead comercial y dale un score de 0 a 100 según su potencial de cierre.',
      '',
      `Nombre: ${lead.name}`,
      `Empresa: ${lead.company ?? '(no indicada)'}`,
      `Email: ${lead.email ?? '(no indicado)'}`,
      `Teléfono: ${lead.phone ?? '(no indicado)'}`,
      `Fuente: ${lead.source ?? '(no indicada)'}`,
      `Status actual: ${lead.status}`,
      `Score anterior: ${lead.score ?? '(nunca calculado)'}`,
      `Contactado el: ${lead.contactedAt?.toISOString() ?? '(no contactado)'}`,
      `Cualificado el: ${lead.qualifiedAt?.toISOString() ?? '(no cualificado)'}`,
      `Creado el: ${lead.createdAt.toISOString()}`,
      '',
      'Notas/interacciones recientes:',
      noteSummary,
      '',
      'Campos personalizados:',
      customFields,
      '',
      'Criterios para puntuar (España, B2B):',
      '- Empresa B2B con dominio corporativo → +20',
      '- Teléfono móvil completo → +10',
      '- Fuente "referido" o "ferias" → +15; "web" → +10; "scraping/lista" → +0',
      '- Notas que muestran intención de compra o presupuesto explícito → +25',
      '- Tono frío, ausencia de respuesta o petición de "info genérica" → -15',
      '- Antigüedad sin contactar > 14 días → -10',
      '',
      'Devuelve el resultado vía la herramienta `submit_lead_score`.',
    ].join('\n');

    // 2. Claude call OUTSIDE the transaction (can take 5-15s).
    const call = await this.ai.callWithTool<ScoreLeadOutput>({
      system:
        'Eres un analista comercial senior B2B en España. Devuelves resultados estructurados y concisos en castellano.',
      userPrompt,
      toolName: 'submit_lead_score',
      toolDescription:
        'Submit the lead score, priority bucket, reasoning and 1-3 recommended next actions.',
      toolInputSchema: {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          reasoning: { type: 'string' },
          recommendedActions: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
        },
        required: ['score', 'priority', 'reasoning', 'recommendedActions'],
      },
      maxTokens: 800,
    });

    // 3. Persist the score in a fresh quick transaction.
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.update({
        where: { id },
        data: {
          score: call.result.score,
          aiScoreReasoning: call.result.reasoning,
          aiScoreActions: call.result.recommendedActions as never,
          aiScoredAt: new Date(),
        },
      }),
    );

    // Fire-and-forget usage log
    void this.ai.recordUsage({
      tenantId,
      feature: 'lead_scoring',
      callResult: call,
      resourceType: 'lead',
      resourceId: id,
    });

    return {
      lead: updated,
      ai: {
        score: call.result.score,
        priority: call.result.priority,
        reasoning: call.result.reasoning,
        recommendedActions: call.result.recommendedActions,
        model: call.model,
        durationMs: call.durationMs,
        costUsd: call.costUsd,
      },
    };
  }

  async bulkImport(tenantId: string, input: ImportLeadsInput) {
    const data = importLeadsSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const created = await tx.lead.createMany({
        data: data.leads.map((l) => ({
          tenantId,
          name: l.name,
          email: l.email,
          phone: l.phone,
          company: l.company,
          source: l.source ?? 'import',
          status: l.status ?? 'NEW',
          ownerId: l.ownerId,
          customFields: (l.customFields as never) ?? undefined,
        })),
        skipDuplicates: true,
      });
      return { imported: created.count };
    });
  }
}
