import { Injectable } from '@nestjs/common';
import {
  BadRequestError,
  NotFoundError,
  createOpportunitySchema,
  updateOpportunitySchema,
  type CreateOpportunityInput,
  type UpdateOpportunityInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { CustomFieldsService } from '../custom-fields/custom-fields.service.js';
import { PipelinesService, resolveStageForStatus, syncStatusFromStage } from '../pipelines/pipelines.service.js';

interface ListOpts {
  status?: string;
  ownerId?: string;
  pipelineId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  /** Bloque de Inteligencia de Negocio — ver el comentario de `list()`. */
  from?: Date;
  to?: Date;
}

const OPEN_STATUSES = ['OPEN', 'QUOTED', 'NEGOTIATING'] as const;
const CLOSED_STATUSES = ['WON', 'LOST'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const STAGE_INCLUDE = {
  lead: { select: { id: true, name: true, email: true, company: true } },
  client: { select: { id: true, name: true, email: true } },
  stage: { select: { id: true, key: true, label: true, color: true, order: true, isWon: true, isLost: true } },
  pipeline: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customFields: CustomFieldsService,
    private readonly pipelines: PipelinesService,
  ) {}

  /**
   * Bloque de Inteligencia de Negocio: `from`/`to` (por defecto últimos 30
   * días si se omiten AMBOS — igual que `ReportsService.economics()`, para
   * que el tablero y el widget de inicio arranquen con el mismo criterio)
   * acotan lo CERRADO (`closedAt` de WON/LOST) al rango elegido — "cuánto
   * cerramos este periodo". Las oportunidades ABIERTAS quedan SIEMPRE
   * visibles pase lo que pase con el rango: el tablero es una herramienta de
   * trabajo del pipeline activo, no un informe — filtrar por fecha de
   * creación escondería un trato de hace 60 días que un comercial todavía
   * está moviendo, y eso sería un defecto, no una función de BI.
   */
  list(tenantId: string, opts: ListOpts = {}) {
    const to = opts.to ?? new Date();
    const from = opts.from ?? new Date(to.getTime() - 30 * DAY_MS);
    const dateFilter = {
      OR: [
        { status: { in: [...OPEN_STATUSES] } },
        { status: { in: [...CLOSED_STATUSES] }, closedAt: { gte: from, lte: to } },
      ],
    };

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.opportunity.findMany({
        where: {
          status: (opts.status as never) || undefined,
          ownerId: opts.ownerId || undefined,
          pipelineId: opts.pipelineId || undefined,
          name: opts.search
            ? { contains: opts.search, mode: 'insensitive' }
            : undefined,
          ...dateFilter,
        },
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 200,
        skip: opts.offset ?? 0,
        include: STAGE_INCLUDE,
      }),
    );
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const opp = await tx.opportunity.findUnique({
        where: { id },
        include: {
          lead: true,
          client: true,
          stage: true,
          pipeline: { include: { stages: { orderBy: { order: 'asc' } } } },
          tasks: { orderBy: { dueAt: 'asc' } },
          documents: { orderBy: { createdAt: 'desc' } },
          notes: { orderBy: { createdAt: 'desc' } },
          stageHistory: {
            orderBy: { movedAt: 'desc' },
            take: 50,
            include: { stage: { select: { id: true, label: true, color: true } } },
          },
        },
      });
      if (!opp) throw new NotFoundError('Oportunidad no encontrada');
      return opp;
    });
  }

  async create(tenantId: string, input: CreateOpportunityInput, userId?: string) {
    const data = createOpportunitySchema.parse(input);
    const customFields = await this.customFields.validateValues(
      tenantId,
      'OPPORTUNITY',
      data.customFields as Record<string, unknown> | undefined,
    );

    // Resolve pipeline + stage. If neither provided, fall back to the default
    // pipeline's first stage.
    let pipelineId = data.pipelineId;
    let stageId = data.stageId;
    let status = data.status ?? 'OPEN';

    if (!pipelineId || !stageId) {
      const def = await this.pipelines.getDefault(tenantId);
      if (def) {
        pipelineId = pipelineId ?? def.id;
        if (!stageId) {
          const candidate = resolveStageForStatus(def, data.status);
          stageId = candidate?.id;
          if (candidate) status = syncStatusFromStage(candidate, status);
        }
      }
    } else {
      const stage = await this.prisma.withTenant(tenantId, (tx) =>
        tx.pipelineStage.findUnique({ where: { id: stageId! } }),
      );
      if (!stage) throw new BadRequestError('Etapa no encontrada');
      status = syncStatusFromStage(stage, status);
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          tenantId,
          name: data.name,
          leadId: data.leadId,
          clientId: data.clientId,
          amount: data.amount,
          currency: data.currency,
          status,
          probability: data.probability,
          expectedCloseDate: data.expectedCloseDate,
          ownerId: data.ownerId ?? userId,
          proposalUrl: data.proposalUrl,
          pipelineId,
          stageId,
          customFields: (customFields as never) ?? undefined,
        },
        include: STAGE_INCLUDE,
      });
      if (stageId) {
        await tx.opportunityStageHistory.create({
          data: {
            tenantId,
            opportunityId: created.id,
            stageId,
            movedBy: userId,
          },
        });
      }
      return created;
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateOpportunityInput,
    userId?: string,
  ) {
    const data = updateOpportunitySchema.parse(input);
    const customFields = await this.customFields.validateValues(
      tenantId,
      'OPPORTUNITY',
      data.customFields as Record<string, unknown> | undefined,
      { partial: true },
    );

    return this.prisma.withTenant(tenantId, async (tx) => {
      const opp = await tx.opportunity.findUnique({ where: { id } });
      if (!opp) throw new NotFoundError('Oportunidad no encontrada');

      let nextStageId = data.stageId ?? opp.stageId;
      let nextPipelineId = data.pipelineId ?? opp.pipelineId;
      let nextStatus = data.status ?? opp.status;

      if (data.stageId && data.stageId !== opp.stageId) {
        const stage = await tx.pipelineStage.findUnique({ where: { id: data.stageId } });
        if (!stage) throw new BadRequestError('Etapa no encontrada');
        nextPipelineId = stage.pipelineId;
        nextStatus = syncStatusFromStage(stage, opp.status);
        nextStageId = stage.id;
      }

      const closedAt =
        !opp.closedAt && ['WON', 'LOST'].includes(nextStatus) ? new Date() : undefined;

      const updated = await tx.opportunity.update({
        where: { id },
        data: {
          name: data.name,
          leadId: data.leadId,
          clientId: data.clientId,
          amount: data.amount,
          currency: data.currency,
          status: nextStatus,
          probability: data.probability,
          expectedCloseDate: data.expectedCloseDate,
          ownerId: data.ownerId,
          proposalUrl: data.proposalUrl,
          pipelineId: nextPipelineId,
          stageId: nextStageId,
          customFields:
            customFields !== undefined ? (customFields as never) : undefined,
          closedAt,
        },
        include: STAGE_INCLUDE,
      });

      if (nextStageId && nextStageId !== opp.stageId) {
        await tx.opportunityStageHistory.create({
          data: {
            tenantId,
            opportunityId: id,
            stageId: nextStageId,
            movedBy: userId,
          },
        });
      }

      return updated;
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const opp = await tx.opportunity.findUnique({ where: { id } });
      if (!opp) throw new NotFoundError('Oportunidad no encontrada');
      await tx.opportunity.delete({ where: { id } });
    });
  }

  // Aggregated counts for the legacy /opportunities/pipeline dashboard endpoint.
  pipeline(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const grouped = await tx.opportunity.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amount: true },
      });
      return grouped.map((g) => ({
        status: g.status,
        count: g._count._all,
        amount: g._sum.amount?.toString() ?? '0',
      }));
    });
  }
}
