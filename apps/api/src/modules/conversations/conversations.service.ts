import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

const STATUSES = ['PENDING', 'ANSWERED', 'CLOSED'] as const;
type Status = (typeof STATUSES)[number];

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, opts: { status?: string; limit?: number } = {}) {
    const status = (STATUSES as readonly string[]).includes(opts.status ?? '')
      ? (opts.status as Status)
      : undefined;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.findMany({
        where: { status },
        orderBy: { lastMessageAt: 'desc' },
        take: opts.limit ?? 100,
        include: { lead: { select: { id: true, name: true, score: true } } },
      }),
    );
  }

  async counts(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [pending, total] = await Promise.all([
        tx.conversation.count({ where: { status: 'PENDING' } }),
        tx.conversation.count(),
      ]);
      return { pending, total };
    });
  }

  async thread(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, score: true, status: true, company: true } },
          messages: { orderBy: { createdAt: 'asc' }, take: 200 },
        },
      });
      if (!conversation) throw new NotFoundError('Conversación no encontrada');
      return conversation;
    });
  }

  async markRead(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id } });
      if (!conv) throw new NotFoundError('Conversación no encontrada');
      return tx.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    });
  }

  async setStatus(tenantId: string, id: string, action: 'close' | 'reopen') {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id } });
      if (!conv) throw new NotFoundError('Conversación no encontrada');
      let status: Status;
      if (action === 'close') {
        status = 'CLOSED';
      } else {
        const inbound = conv.lastInboundAt?.getTime() ?? 0;
        const outbound = conv.lastOutboundAt?.getTime() ?? 0;
        status = outbound >= inbound ? 'ANSWERED' : 'PENDING';
      }
      return tx.conversation.update({ where: { id }, data: { status } });
    });
  }
}
