import { Injectable } from '@nestjs/common';
import { NotFoundError, BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MailConnectionsService } from './mail-connections.service.js';
import { MailContactsService } from './mail-contacts.service.js';
import { guessLanguage } from './mail-ai.service.js';
import { htmlToText } from '../../common/utils/email-html.js';

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

/**
 * ¿Este hilo está sin leer PARA ESTE USUARIO?
 *
 * Con fila propia manda la fila (llegó algo después de mi última lectura).
 * Sin fila se cae al contador global: así el primer deploy no marca toda la
 * bandeja como no leída para todo el mundo — el estado por usuario va
 * divergiendo del global a medida que cada uno lee o recibe asignaciones.
 */
export function isUnreadForMe(
  read: { lastReadAt: Date } | null | undefined,
  thread: { lastMessageAt: Date | null; unreadCount: number },
): boolean {
  if (read) return !!thread.lastMessageAt && thread.lastMessageAt > read.lastReadAt;
  return thread.unreadCount > 0;
}

const PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

/** Thread fields the list/search views need. */
const THREAD_ROW = {
  id: true,
  subject: true,
  snippet: true,
  participants: true,
  unreadCount: true,
  status: true,
  assigneeUserId: true,
  lastMessageAt: true,
} as const;

/**
 * Keyset cursor: "<lastMessageAt ISO>|<id>". Keyset (not offset) so paging stays
 * stable while new mail arrives — an OFFSET page 2 would skip or repeat threads
 * every time something lands in the inbox.
 */
export function encodeThreadCursor(t: { lastMessageAt: Date | null; id: string }): string {
  return `${(t.lastMessageAt ?? new Date(0)).toISOString()}|${t.id}`;
}

export function decodeThreadCursor(raw: string | undefined): { at: Date; id: string } | null {
  if (!raw) return null;
  // indexOf, not lastIndexOf: the ISO timestamp never contains a pipe, so the
  // FIRST one is the separator and the id keeps whatever it contains.
  const sep = raw.indexOf('|');
  if (sep <= 0) return null;
  const at = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (Number.isNaN(at.getTime()) || !id) return null;
  return { at, id };
}

/**
 * Everything strictly "older" than the cursor, under (lastMessageAt desc, id desc).
 *
 * Returned as an AND-clause array, never spread into `where`: the search query
 * already owns the top-level `OR`, and a spread would overwrite one of the two
 * silently — dropping the cursor and paging forever over the same rows.
 */
function afterCursor(cursor: { at: Date; id: string } | null) {
  if (!cursor) return [];
  return [
    {
      OR: [
        { lastMessageAt: { lt: cursor.at } },
        { lastMessageAt: cursor.at, id: { lt: cursor.id } },
      ],
    },
  ];
}

@Injectable()
export class MailInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MailConnectionsService,
    private readonly contacts: MailContactsService,
  ) {}

  /**
   * Threads in a folder of an accessible connection, newest activity first and
   * paged by keyset cursor. Previously capped at a hard 50 with no cursor, so a
   * real mailbox lost access to anything older within days.
   */
  async listThreads(
    tenantId: string,
    connectionId: string,
    actor: Actor,
    folderRaw?: string,
    opts: { cursor?: string; limit?: number; mine?: boolean } = {},
  ): Promise<{ items: unknown[]; nextCursor: string | null }> {
    await this.connections.assertAccess(tenantId, connectionId, actor);
    const folder = asFolder(folderRaw);
    // INBOX/ARCHIVE/SPAM/TRASH are thread buckets. SENT/DRAFTS are message-level
    // (a thread "appears" in them if it has a matching message).
    const base =
      folder === 'SENT'
        ? { connectionId, messages: { some: { direction: 'OUT' as const, isDraft: false } } }
        : folder === 'DRAFTS'
          ? { connectionId, messages: { some: { isDraft: true } } }
          : { connectionId, folder };
    // «Solo los míos»: filtro en servidor, no en cliente — con paginación por
    // cursor, filtrar en cliente rompería las páginas.
    const scope = opts.mine ? { ...base, assigneeUserId: actor.userId } : base;
    const cursor = decodeThreadCursor(opts.cursor);
    const take = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findMany({
        where: { ...scope, AND: afterCursor(cursor) },
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        // One extra row tells us whether another page exists without a count().
        take: take + 1,
        select: THREAD_ROW,
      }),
    );
    const paged = this.page(rows, take);
    return { ...paged, items: await this.annotateUnread(tenantId, actor.userId, paged.items) };
  }

  /**
   * Añade `unreadForMe` a cada fila (una sola query por página). El global
   * `unreadCount` se conserva: los buzones privados y los badges lo siguen
   * usando.
   */
  private async annotateUnread(
    tenantId: string,
    userId: string,
    items: { id: string; lastMessageAt: Date | null; unreadCount: number }[],
  ) {
    if (!items.length) return items;
    const reads = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThreadRead.findMany({
        where: { userId, threadId: { in: items.map((i) => i.id) } },
        select: { threadId: true, lastReadAt: true },
      }),
    );
    const byThread = new Map(reads.map((r) => [r.threadId, r]));
    return items.map((i) => ({ ...i, unreadForMe: isUnreadForMe(byThread.get(i.id), i) }));
  }

  /** Trim the sentinel row and derive the next cursor from the last kept item. */
  private page<T extends { id: string; lastMessageAt: Date | null }>(rows: T[], take: number) {
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? encodeThreadCursor(last) : null };
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
  async search(
    tenantId: string,
    connectionId: string,
    actor: Actor,
    q: string,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<{ items: unknown[]; nextCursor: string | null }> {
    await this.connections.assertAccess(tenantId, connectionId, actor);
    const term = (q ?? '').trim();
    if (term.length < 2) return { items: [], nextCursor: null };
    const cursor = decodeThreadCursor(opts.cursor);
    const take = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findMany({
        where: {
          connectionId,
          AND: afterCursor(cursor),
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
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        select: THREAD_ROW,
      }),
    );
    const paged = this.page(rows, take);
    return { ...paged, items: await this.annotateUnread(tenantId, actor.userId, paged.items) };
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

  /**
   * Contadores del filtro «Solo los míos»: cuántos hilos tengo asignados en
   * Recibidos y cuántos de ellos están sin leer PARA MÍ.
   */
  async mineCounts(
    tenantId: string,
    connectionId: string,
    actor: Actor,
  ): Promise<{ assigned: number; unread: number }> {
    await this.connections.assertAccess(tenantId, connectionId, actor);
    const threads = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findMany({
        where: { connectionId, folder: 'INBOX', assigneeUserId: actor.userId },
        select: { id: true, lastMessageAt: true, unreadCount: true },
      }),
    );
    const annotated = await this.annotateUnread(tenantId, actor.userId, threads);
    return {
      assigned: threads.length,
      unread: annotated.filter((x) => (x as { unreadForMe?: boolean }).unreadForMe).length,
    };
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
          // So the header can say "María García vía ventas@empresa.com" instead
          // of a bare "Tú" that hides which colleague replied.
          sentBy: { select: { id: true, name: true } },
        },
      }),
    );
    const contact = await this.contacts.findByEmail(tenantId, firstParticipant(thread.participants));
    await this.backfillLanguages(tenantId, messages);
    return { thread, messages, contact };
  }

  /**
   * Fill in `detectedLang` for messages that predate the detection (everything
   * ingested before it existed, and anything created outside the ingest path).
   *
   * Without this every historical message reports "unknown", and the UI would
   * offer "Traducir" on Spanish mail — exactly the noise the feature is meant to
   * avoid. Runs at most once per message: the guess is persisted, so the 12s
   * thread poller finds it already set. Pure heuristic, no model call, and the
   * mutated objects are the ones we return so the first response is correct too.
   */
  private async backfillLanguages(tenantId: string, messages: { id: string; detectedLang: string | null; text: string | null; html: string | null }[]) {
    const found: { id: string; lang: string }[] = [];
    for (const m of messages) {
      if (m.detectedLang) continue;
      const body = (m.text ?? '').trim() || htmlToText(m.html ?? '');
      const lang = guessLanguage(body);
      // A null guess is NOT persisted: it costs nothing to recompute, and a
      // sentinel would just be a value we'd have to special-case forever.
      if (!lang) continue;
      m.detectedLang = lang;
      found.push({ id: m.id, lang });
    }
    if (!found.length) return;
    await this.prisma
      .withTenant(tenantId, async (tx) => {
        for (const f of found) {
          await tx.emailMessage.update({ where: { id: f.id }, data: { detectedLang: f.lang } });
        }
      })
      .catch(() => undefined); // best-effort: never break opening a thread
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
      // Estado POR USUARIO: leído = ahora; no-leído = epoch (así la regla
      // lastMessageAt > lastReadAt lo marca sin ambigüedad). El estado global
      // de abajo se conserva para buzones privados y los badges existentes.
      await tx.emailThreadRead.upsert({
        where: { threadId_userId: { threadId, userId: actor.userId } },
        create: { tenantId, threadId, userId: actor.userId, lastReadAt: read ? new Date() : new Date(0) },
        update: { lastReadAt: read ? new Date() : new Date(0) },
      });
      if (read) {
        await tx.emailMessage.updateMany({
          where: { threadId, readAt: null },
          data: { readAt: new Date() },
        });
        return tx.emailThread.update({
          where: { id: threadId },
          data: { unreadCount: 0 },
          select: { id: true, unreadCount: true },
        });
      }
      // Marking unread means "treat the whole thread as new" (Gmail semantics):
      // clear readAt on every inbound message and derive the counter from them,
      // instead of hardcoding 1 and losing the real count.
      await tx.emailMessage.updateMany({
        where: { threadId, direction: 'IN' },
        data: { readAt: null },
      });
      const unread = await tx.emailMessage.count({
        where: { threadId, direction: 'IN', isDraft: false },
      });
      return tx.emailThread.update({
        where: { id: threadId },
        data: { unreadCount: Math.max(1, unread) },
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
