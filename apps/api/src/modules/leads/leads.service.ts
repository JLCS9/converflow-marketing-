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

interface ListOpts {
  status?: string;
  ownerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

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
