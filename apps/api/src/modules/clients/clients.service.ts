import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

interface ListOpts {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, opts: ListOpts = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.client.findMany({
        where: {
          status: (opts.status as never) || undefined,
          OR: opts.search
            ? [
                { name: { contains: opts.search, mode: 'insensitive' } },
                { email: { contains: opts.search, mode: 'insensitive' } },
                { nif: { contains: opts.search, mode: 'insensitive' } },
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
      const client = await tx.client.findUnique({
        where: { id },
        include: {
          leads: { orderBy: { createdAt: 'desc' } },
          opportunities: { orderBy: { createdAt: 'desc' } },
          tasks: { orderBy: { dueAt: 'asc' } },
          notes: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!client) throw new NotFoundError('Cliente no encontrado');
      return client;
    });
  }

  async create(tenantId: string, input: CreateClientInput) {
    const data = createClientSchema.parse(input);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.client.create({ data: { tenantId, ...data } }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateClientInput) {
    const data = updateClientSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const client = await tx.client.findUnique({ where: { id } });
      if (!client) throw new NotFoundError('Cliente no encontrado');
      return tx.client.update({ where: { id }, data });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const client = await tx.client.findUnique({ where: { id } });
      if (!client) throw new NotFoundError('Cliente no encontrado');
      await tx.client.delete({ where: { id } });
    });
  }
}
