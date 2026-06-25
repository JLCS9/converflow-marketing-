import { Injectable } from '@nestjs/common';
import { NotFoundError, BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MailConnectionsService } from './mail-connections.service.js';
import { MailContactsService } from './mail-contacts.service.js';

interface Actor {
  userId: string;
  role: string;
}

function firstParticipant(participants: unknown): string | null {
  return Array.isArray(participants) && typeof participants[0] === 'string' ? participants[0] : null;
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
    private readonly contacts: MailContactsService,
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

  /** Total unread INBOX threads across all mailboxes the actor can access (for the navbar badge). */
  async unreadCount(tenantId: string, actor: Actor): Promise<{ unread: number }> {
    const conns = await this.connections.list(tenantId, actor);
    const ids = conns.map((c) => c.id);
    if (!ids.length) return { unread: 0 };
    const unread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.count({
        where: { connectionId: { in: ids }, folder: 'INBOX', unreadCount: { gt: 0 } },
      }),
    );
    return { unread };
  }

  /** Unread INBOX count per accessible connection — to flag other mailboxes. */
  async unreadByConnection(tenantId: string, actor: Actor): Promise<Record<string, number>> {
    const conns = await this.connections.list(tenantId, actor);
    const ids = conns.map((c) => c.id);
    if (!ids.length) return {};
    return this.prisma.withTenant(tenantId, async (tx) => {
      const grouped = await tx.emailThread.groupBy({
        by: ['connectionId'],
        where: { connectionId: { in: ids }, folder: 'INBOX', unreadCount: { gt: 0 } },
        _count: { _all: true },
      });
      const out: Record<string, number> = {};
      for (const g of grouped) out[g.connectionId] = g._count._all;
      return out;
    });
  }

  /** Recent unread INBOX threads across accessible mailboxes — "correo por contestar". */
  async pending(tenantId: string, actor: Actor, limit = 8) {
    const conns = await this.connections.list(tenantId, actor);
    const ids = conns.map((c) => c.id);
    if (!ids.length) return [];
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findMany({
        where: { connectionId: { in: ids }, folder: 'INBOX', unreadCount: { gt: 0 } },
        orderBy: { lastMessageAt: 'desc' },
        take: limit,
        select: {
          id: true,
          subject: true,
          snippet: true,
          participants: true,
          unreadCount: true,
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
          attachments: {
            select: { id: true, filename: true, mimeType: true, sizeBytes: true, storageKey: true },
          },
        },
      }),
    );
    const contact = await this.contacts.findByEmail(tenantId, firstParticipant(thread.participants));
    return { thread, messages, contact };
  }

  /** Save the thread's contact as a CRM lead (or return the existing lead/client). */
  async saveLead(tenantId: string, threadId: string, actor: Actor) {
    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: threadId }, select: { connectionId: true, participants: true } }),
    );
    if (!thread) throw new NotFoundError('Hilo no encontrado');
    await this.connections.assertAccess(tenantId, thread.connectionId, actor);
    const email = firstParticipant(thread.participants);
    if (!email) throw new BadRequestError('No hay email de contacto en este hilo');
    const contact = await this.contacts.ensureLead(tenantId, { email, source: 'Correo' });
    if (!contact) throw new BadRequestError('No se pudo guardar el contacto');
    return { contact };
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
