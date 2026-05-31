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
import { PipelinesService } from '../pipelines/pipelines.service.js';

interface ListOpts {
  status?: string;
  ownerId?: string;
  pipelineId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

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

  list(tenantId: string, opts: ListOpts = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.opportunity.findMany({
        where: {
          status: (opts.status as never) || undefined,
          ownerId: opts.ownerId || undefined,
          pipelineId: opts.pipelineId || undefined,
          name: opts.search
            ? { contains: opts.search, mode: 'insensitive' }
            : undefined,
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
          // Pick stage matching the requested status (by isWon/isLost), else
          // the first stage in order.
          let candidate = def.stages[0];
          if (data.status === 'WON') candidate = def.stages.find((s) => s.isWon) ?? candidate;
          else if (data.status === 'LOST') candidate = def.stages.find((s) => s.isLost) ?? candidate;
          else if (data.status) {
            const byKey = def.stages.find((s) => s.key === data.status);
            if (byKey) candidate = byKey;
          }
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

function syncStatusFromStage(
  stage: { isWon: boolean; isLost: boolean; key: string },
  fallback: 'OPEN' | 'QUOTED' | 'NEGOTIATING' | 'WON' | 'LOST',
): 'OPEN' | 'QUOTED' | 'NEGOTIATING' | 'WON' | 'LOST' {
  if (stage.isWon) return 'WON';
  if (stage.isLost) return 'LOST';
  const known = ['OPEN', 'QUOTED', 'NEGOTIATING'] as const;
  if ((known as readonly string[]).includes(stage.key)) {
    return stage.key as 'OPEN' | 'QUOTED' | 'NEGOTIATING';
  }
  if (fallback === 'WON' || fallback === 'LOST') return 'OPEN';
  return fallback;
}
