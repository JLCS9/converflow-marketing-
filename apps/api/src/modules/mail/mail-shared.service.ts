import { Injectable } from '@nestjs/common';
import { NotFoundError, BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MailConnectionsService } from './mail-connections.service.js';

interface Actor {
  userId: string;
  role: string;
}

const STATUSES = ['OPEN', 'PENDING', 'CLOSED'] as const;
type Status = (typeof STATUSES)[number];

/** A lock older than this is considered stale (the agent left without releasing). */
const LOCK_TTL_MS = 60_000;

/**
 * Shared-mailbox collaboration: assignment, status (open/pending/closed),
 * internal team notes, and a soft lock for anti-collision while replying.
 */
@Injectable()
export class MailSharedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MailConnectionsService,
  ) {}

  private async assertThread(tenantId: string, threadId: string, actor: Actor) {
    const t = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: threadId }, select: { connectionId: true } }),
    );
    if (!t) throw new NotFoundError('Hilo no encontrado');
    await this.connections.assertAccess(tenantId, t.connectionId, actor);
  }

  private async userName(tenantId: string, userId: string): Promise<string> {
    const u = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({ where: { id: userId }, select: { name: true } }),
    );
    return u?.name ?? 'Agente';
  }

  /** Active team members (for the assignee picker + name resolution). */
  listTeam(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async assign(tenantId: string, threadId: string, actor: Actor, assigneeUserId: string | null) {
    await this.assertThread(tenantId, threadId, actor);
    if (assigneeUserId) {
      const u = await this.prisma.withTenant(tenantId, (tx) =>
        tx.user.findUnique({ where: { id: assigneeUserId }, select: { id: true } }),
      );
      if (!u) throw new BadRequestError('Usuario inválido');
    }
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.update({
        where: { id: threadId },
        data: { assigneeUserId },
        select: { id: true, assigneeUserId: true },
      }),
    );
  }

  async setStatus(tenantId: string, threadId: string, actor: Actor, status: string) {
    if (!(STATUSES as readonly string[]).includes(status)) throw new BadRequestError('Estado inválido');
    await this.assertThread(tenantId, threadId, actor);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.update({
        where: { id: threadId },
        data: { status: status as Status },
        select: { id: true, status: true },
      }),
    );
  }

  // ---- internal notes ----

  async listNotes(tenantId: string, threadId: string, actor: Actor) {
    await this.assertThread(tenantId, threadId, actor);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThreadNote.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, authorName: true, authorUserId: true, createdAt: true },
      }),
    );
  }

  async addNote(tenantId: string, threadId: string, actor: Actor, body: string) {
    const text = (body ?? '').trim();
    if (!text) throw new BadRequestError('La nota está vacía');
    await this.assertThread(tenantId, threadId, actor);
    const authorName = await this.userName(tenantId, actor.userId);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThreadNote.create({
        data: { tenantId, threadId, authorUserId: actor.userId, authorName, body: text.slice(0, 5000) },
        select: { id: true, body: true, authorName: true, authorUserId: true, createdAt: true },
      }),
    );
  }

  async deleteNote(tenantId: string, noteId: string, actor: Actor) {
    const note = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThreadNote.findUnique({
        where: { id: noteId },
        select: { id: true, authorUserId: true, threadId: true },
      }),
    );
    if (!note) throw new NotFoundError('Nota no encontrada');
    if (note.authorUserId !== actor.userId && actor.role !== 'OWNER') {
      throw new BadRequestError('No puedes borrar esta nota');
    }
    await this.assertThread(tenantId, note.threadId, actor);
    await this.prisma.withTenant(tenantId, (tx) => tx.emailThreadNote.delete({ where: { id: noteId } }));
    return { ok: true };
  }

  // ---- anti-collision soft lock ----

  /** Claim/refresh the reply lock. If someone else holds a fresh lock, reports them. */
  async claim(tenantId: string, threadId: string, actor: Actor) {
    await this.assertThread(tenantId, threadId, actor);
    const now = new Date();
    return this.prisma.withTenant(tenantId, async (tx) => {
      const t = await tx.emailThread.findUnique({
        where: { id: threadId },
        select: { lockedByUserId: true, lockedAt: true },
      });
      const stale = !t?.lockedAt || now.getTime() - new Date(t.lockedAt).getTime() > LOCK_TTL_MS;
      const heldByOther = !!t?.lockedByUserId && t.lockedByUserId !== actor.userId && !stale;
      if (heldByOther) {
        const holder = await tx.user.findUnique({
          where: { id: t!.lockedByUserId! },
          select: { name: true },
        });
        return { locked: true, byMe: false, byName: holder?.name ?? 'Otro agente' };
      }
      await tx.emailThread.update({
        where: { id: threadId },
        data: { lockedByUserId: actor.userId, lockedAt: now },
      });
      return { locked: true, byMe: true, byName: null as string | null };
    });
  }

  async release(tenantId: string, threadId: string, actor: Actor) {
    await this.assertThread(tenantId, threadId, actor);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const t = await tx.emailThread.findUnique({
        where: { id: threadId },
        select: { lockedByUserId: true },
      });
      if (t?.lockedByUserId === actor.userId) {
        await tx.emailThread.update({
          where: { id: threadId },
          data: { lockedByUserId: null, lockedAt: null },
        });
      }
      return { ok: true };
    });
  }
}
