import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createOpportunitySchema,
  updateOpportunitySchema,
  type CreateOpportunityInput,
  type UpdateOpportunityInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

interface ListOpts {
  status?: string;
  ownerId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, opts: ListOpts = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.opportunity.findMany({
        where: {
          status: (opts.status as never) || undefined,
          ownerId: opts.ownerId || undefined,
        },
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 100,
        skip: opts.offset ?? 0,
        include: {
          lead: { select: { id: true, name: true, email: true } },
          client: { select: { id: true, name: true, email: true } },
        },
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
          tasks: { orderBy: { dueAt: 'asc' } },
          documents: { orderBy: { createdAt: 'desc' } },
          notes: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!opp) throw new NotFoundError('Oportunidad no encontrada');
      return opp;
    });
  }

  async create(tenantId: string, input: CreateOpportunityInput) {
    const data = createOpportunitySchema.parse(input);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.opportunity.create({
        data: {
          tenantId,
          name: data.name,
          leadId: data.leadId,
          clientId: data.clientId,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          probability: data.probability,
          expectedCloseDate: data.expectedCloseDate,
          ownerId: data.ownerId,
          proposalUrl: data.proposalUrl,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateOpportunityInput) {
    const data = updateOpportunitySchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const opp = await tx.opportunity.findUnique({ where: { id } });
      if (!opp) throw new NotFoundError('Oportunidad no encontrada');

      // Mark closed when status moves to WON or LOST
      const dataWithStamps = {
        ...data,
        closedAt:
          !opp.closedAt && data.status && ['WON', 'LOST'].includes(data.status)
            ? new Date()
            : undefined,
      };
      return tx.opportunity.update({ where: { id }, data: dataWithStamps });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const opp = await tx.opportunity.findUnique({ where: { id } });
      if (!opp) throw new NotFoundError('Oportunidad no encontrada');
      await tx.opportunity.delete({ where: { id } });
    });
  }

  // Pipeline aggregate for dashboard
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
