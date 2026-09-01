import { Injectable } from '@nestjs/common';
import { NotFoundError, BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MailConnectionsService } from './mail-connections.service.js';
import { env } from '../../config/env.js';

/** Marca de las tareas creadas por asignación de bandeja (con sourceRef = threadId). */
export const MAIL_TASK_SOURCE = 'mail-assign';

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

  /**
   * Asignar un hilo a alguien hace tres cosas, todas en la misma transacción:
   *
   * 1. Fija el asignado en el hilo.
   * 2. Lo marca como NO LEÍDO para el asignado (fila por-usuario a epoch): si
   *    te asignan algo, tiene que saltar a la vista aunque otro ya lo leyera.
   * 3. Crea/actualiza la tarea vinculada. Idempotente por (source, sourceRef):
   *    reasignar ACTUALIZA la tarea (nuevo dueño, vuelve a PENDING), nunca
   *    duplica. Desasignar la cancela si seguía pendiente.
   */
  async assign(tenantId: string, threadId: string, actor: Actor, assigneeUserId: string | null) {
    await this.assertThread(tenantId, threadId, actor);
    if (assigneeUserId) {
      const u = await this.prisma.withTenant(tenantId, (tx) =>
        tx.user.findUnique({ where: { id: assigneeUserId }, select: { id: true } }),
      );
      if (!u) throw new BadRequestError('Usuario inválido');
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const thread = await tx.emailThread.update({
        where: { id: threadId },
        data: { assigneeUserId },
        select: { id: true, assigneeUserId: true, subject: true, connectionId: true },
      });

      const existingTask = await tx.task.findFirst({
        where: { source: MAIL_TASK_SOURCE, sourceRef: threadId },
        select: { id: true, status: true },
      });

      if (assigneeUserId) {
        await tx.emailThreadRead.upsert({
          where: { threadId_userId: { threadId, userId: assigneeUserId } },
          create: { tenantId, threadId, userId: assigneeUserId, lastReadAt: new Date(0) },
          update: { lastReadAt: new Date(0) },
        });

        const title = `Correo: ${(thread.subject ?? '').trim() || '(sin asunto)'}`.slice(0, 200);
        const link = `${env.WEB_PUBLIC_URL}/app/mail?conn=${thread.connectionId}&thread=${threadId}`;
        const description = `Hilo de correo asignado desde la bandeja compartida.\n${link}`;
        if (existingTask) {
          await tx.task.update({
            where: { id: existingTask.id },
            data: { ownerId: assigneeUserId, status: 'PENDING', title, description },
          });
        } else {
          await tx.task.create({
            data: {
              tenantId,
              title,
              description,
              type: 'EMAIL',
              priority: 'MEDIUM',
              status: 'PENDING',
              ownerId: assigneeUserId,
              source: MAIL_TASK_SOURCE,
              sourceRef: threadId,
            },
          });
        }
      } else if (existingTask && existingTask.status !== 'DONE') {
        // Desasignado sin responder: la tarea deja de tener sentido.
        await tx.task.update({ where: { id: existingTask.id }, data: { status: 'CANCELLED' } });
      }

      return { id: thread.id, assigneeUserId: thread.assigneeUserId };
    });
  }

  /**
   * Completa la tarea vinculada al hilo, si existe y sigue abierta. Lo llaman
   * responder (decisión de producto: responder = trabajo hecho) y cerrar el
   * hilo. Nunca falla la operación principal por esto.
   */
  async completeLinkedTask(tenantId: string, threadId: string): Promise<void> {
    await this.prisma
      .withTenant(tenantId, (tx) =>
        tx.task.updateMany({
          where: { source: MAIL_TASK_SOURCE, sourceRef: threadId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
          data: { status: 'DONE' },
        }),
      )
      .catch(() => undefined);
  }

  async setStatus(tenantId: string, threadId: string, actor: Actor, status: string) {
    if (!(STATUSES as readonly string[]).includes(status)) throw new BadRequestError('Estado inválido');
    await this.assertThread(tenantId, threadId, actor);
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.update({
        where: { id: threadId },
        data: { status: status as Status },
        select: { id: true, status: true },
      }),
    );
    if (status === 'CLOSED') await this.completeLinkedTask(tenantId, threadId);
    return updated;
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
