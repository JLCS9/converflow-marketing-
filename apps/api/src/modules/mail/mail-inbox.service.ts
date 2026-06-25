import { Injectable } from '@nestjs/common';
import { NotFoundError, BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MailConnectionsService } from './mail-connections.service.js';

interface Actor {
  userId: string;
  role: string;
}

const FOLDERS = ['INBOX', 'SENT', 'DRAFTS', 'SPAM', 'ARCHIVE', 'TRASH'] as const;
type Folder = (typeof FOLDERS)[number];

function asFolder(v: string | undefined): Folder {
  return (FOLDERS as readonly string[]).includes(v ?? '') ? (v as Folder) : 'INBOX';
}

@Injectable()
export class MailInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MailConnectionsService,
  ) {}

  /** Threads in a folder of an accessible connection (bucket folders for now). */
  async listThreads(tenantId: string, connectionId: string, actor: Actor, folderRaw?: string) {
    await this.connections.assertAccess(tenantId, connectionId, actor);
    const folder = asFolder(folderRaw);
    // INBOX/ARCHIVE/SPAM/TRASH are thread buckets. SENT/DRAFTS are message-level
    // (a thread "appears" in them if it has a matching message).
    const where =
      folder === 'SENT'
        ? { connectionId, messages: { some: { direction: 'OUT' as const, isDraft: false } } }
        : folder === 'DRAFTS'
          ? { connectionId, messages: { some: { isDraft: true } } }
          : { connectionId, folder };
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take: 50,
        select: {
          id: true,
          subject: true,
          snippet: true,
          participants: true,
          unreadCount: true,
          status: true,
          assigneeUserId: true,
          lastMessageAt: true,
        },
      }),
    );
  }

  /** Full-text-ish search across all folders of a connection (subject/snippet/body/sender). */
  async search(tenantId: string, connectionId: string, actor: Actor, q: string) {
    await this.connections.assertAccess(tenantId, connectionId, actor);
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findMany({
        where: {
          connectionId,
          OR: [
            { subject: { contains: term, mode: 'insensitive' } },
            { snippet: { contains: term, mode: 'insensitive' } },
            {
              messages: {
                some: {
                  OR: [
                    { subject: { contains: term, mode: 'insensitive' } },
                    { text: { contains: term, mode: 'insensitive' } },
                    { fromAddress: { contains: term, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 50,
        select: {
          id: true,
          subject: true,
          snippet: true,
          participants: true,
          unreadCount: true,
          status: true,
          assigneeUserId: true,
          lastMessageAt: true,
        },
      }),
    );
  }

  /** Unread counts per bucket folder, for the sidebar badges. */
  async folderCounts(tenantId: string, connectionId: string, actor: Actor) {
    await this.connections.assertAccess(tenantId, connectionId, actor);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const grouped = await tx.emailThread.groupBy({
        by: ['folder'],
        where: { connectionId, unreadCount: { gt: 0 } },
        _count: { _all: true },
      });
      const out: Record<string, number> = {};
      for (const g of grouped) out[g.folder] = g._count._all;
      return out;
    });
  }

  async getThread(tenantId: string, threadId: string, actor: Actor) {
    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: threadId } }),
    );
    if (!thread) throw new NotFoundError('Hilo no encontrado');
    await this.connections.assertAccess(tenantId, thread.connectionId, actor);
    const messages = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
        include: {
          attachments: { select: { id: true, filename: true, mimeType: true, sizeBytes: true } },
        },
      }),
    );
    return { thread, messages };
  }

  async setRead(tenantId: string, threadId: string, actor: Actor, read: boolean) {
    await this.assertThreadAccess(tenantId, threadId, actor);
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (read) {
        await tx.emailMessage.updateMany({
          where: { threadId, readAt: null },
          data: { readAt: new Date() },
        });
      }
      return tx.emailThread.update({
        where: { id: threadId },
        data: { unreadCount: read ? 0 : 1 },
        select: { id: true, unreadCount: true },
      });
    });
  }

  async move(tenantId: string, threadId: string, actor: Actor, folderRaw: string) {
    if (!(FOLDERS as readonly string[]).includes(folderRaw)) {
      throw new BadRequestError('Carpeta inválida');
    }
    await this.assertThreadAccess(tenantId, threadId, actor);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.update({
        where: { id: threadId },
        data: { folder: folderRaw as Folder },
        select: { id: true, folder: true },
      }),
    );
  }

  private async assertThreadAccess(tenantId: string, threadId: string, actor: Actor) {
    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: threadId }, select: { connectionId: true } }),
    );
    if (!thread) throw new NotFoundError('Hilo no encontrado');
    await this.connections.assertAccess(tenantId, thread.connectionId, actor);
  }
}
