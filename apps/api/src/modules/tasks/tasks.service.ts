import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

interface ListOpts {
  status?: string;
  ownerId?: string;
  leadId?: string;
  opportunityId?: string;
  clientId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, opts: ListOpts = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.task.findMany({
        where: {
          status: (opts.status as never) || undefined,
          ownerId: opts.ownerId || undefined,
          leadId: opts.leadId || undefined,
          opportunityId: opts.opportunityId || undefined,
          clientId: opts.clientId || undefined,
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: opts.limit ?? 100,
        skip: opts.offset ?? 0,
        include: {
          lead: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
          opportunity: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
    );
  }

  async create(tenantId: string, input: CreateTaskInput) {
    const data = createTaskSchema.parse(input);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.task.create({ data: { tenantId, source: 'manual', ...data } }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateTaskInput) {
    const data = updateTaskSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const task = await tx.task.findUnique({ where: { id } });
      if (!task) throw new NotFoundError('Tarea no encontrada');

      // Auto-stamp completion when status transitions to DONE
      const completedAt =
        !task.completedAt && data.status === 'DONE' ? new Date() : undefined;

      return tx.task.update({ where: { id }, data: { ...data, completedAt } });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const task = await tx.task.findUnique({ where: { id } });
      if (!task) throw new NotFoundError('Tarea no encontrada');
      await tx.task.delete({ where: { id } });
    });
  }

  /** Active users for the assignee picker (gated by 'crm' like the rest of tasks). */
  assignees(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    );
  }

  // Quick stats for the tenant dashboard
  stats(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const [pending, overdue, doneThisWeek] = await Promise.all([
        tx.task.count({ where: { status: 'PENDING' } }),
        tx.task.count({
          where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } },
        }),
        tx.task.count({
          where: {
            status: 'DONE',
            completedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
      ]);
      return { pending, overdue, doneThisWeek };
    });
  }
}
