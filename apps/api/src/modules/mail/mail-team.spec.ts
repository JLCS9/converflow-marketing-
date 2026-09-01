import { describe, it, expect, vi } from 'vitest';
import { MailSharedService } from './mail-shared.service.js';
import { isUnreadForMe } from './mail-inbox.service.js';

/**
 * Bandeja de equipo: asignar crea una tarea vinculada (idempotente) y marca el
 * hilo como no leído PARA EL ASIGNADO; el estado leído es por usuario.
 */
const actor = { userId: 'u1', role: 'OWNER' };

function makeService(over: {
  existingTask?: { id: string; status: string } | null;
} = {}) {
  const taskCreate = vi.fn().mockResolvedValue({});
  const taskUpdate = vi.fn().mockResolvedValue({});
  const taskUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const readUpsert = vi.fn().mockResolvedValue({});
  const tx = {
    emailThread: {
      findUnique: vi.fn().mockResolvedValue({ connectionId: 'c1' }),
      update: vi.fn().mockResolvedValue({
        id: 'th1',
        assigneeUserId: 'u2',
        subject: 'Presupuesto 2026',
        connectionId: 'c1',
      }),
    },
    emailThreadRead: { upsert: readUpsert },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u2' }) },
    task: {
      findFirst: vi.fn().mockResolvedValue(over.existingTask ?? null),
      create: taskCreate,
      update: taskUpdate,
      updateMany: taskUpdateMany,
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const connections = { assertAccess: vi.fn().mockResolvedValue({}) } as never;
  return { svc: new MailSharedService(prisma, connections), taskCreate, taskUpdate, taskUpdateMany, readUpsert, tx };
}

describe('MailSharedService.assign — tarea vinculada', () => {
  it('primera asignación: crea la tarea con dueño, tipo EMAIL y sourceRef del hilo', async () => {
    const { svc, taskCreate } = makeService();
    await svc.assign('t', 'th1', actor, 'u2');
    const data = taskCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      ownerId: 'u2',
      type: 'EMAIL',
      status: 'PENDING',
      source: 'mail-assign',
      sourceRef: 'th1',
    });
    expect(data.title).toContain('Presupuesto 2026');
    expect(data.description).toContain('/app/mail?conn=c1&thread=th1');
  });

  it('reasignar ACTUALIZA la tarea existente (nunca duplica) y la reabre', async () => {
    const { svc, taskCreate, taskUpdate } = makeService({
      existingTask: { id: 'task9', status: 'DONE' },
    });
    await svc.assign('t', 'th1', actor, 'u2');
    expect(taskCreate).not.toHaveBeenCalled();
    expect(taskUpdate.mock.calls[0]![0]).toMatchObject({
      where: { id: 'task9' },
      data: expect.objectContaining({ ownerId: 'u2', status: 'PENDING' }),
    });
  });

  it('asignar marca el hilo NO LEÍDO para el asignado (fila a epoch)', async () => {
    const { svc, readUpsert } = makeService();
    await svc.assign('t', 'th1', actor, 'u2');
    const call = readUpsert.mock.calls[0]![0];
    expect(call.where).toEqual({ threadId_userId: { threadId: 'th1', userId: 'u2' } });
    expect(call.update.lastReadAt.getTime()).toBe(0);
  });

  it('desasignar cancela la tarea pendiente en vez de dejarla huérfana', async () => {
    const { svc, taskUpdate, readUpsert } = makeService({
      existingTask: { id: 'task9', status: 'PENDING' },
    });
    // Nota: el update del hilo devuelve el mock fijo, pero lo que se comprueba
    // es la rama de assigneeUserId null.
    await svc.assign('t', 'th1', actor, null);
    expect(taskUpdate.mock.calls[0]![0].data).toMatchObject({ status: 'CANCELLED' });
    expect(readUpsert).not.toHaveBeenCalled();
  });

  it('completeLinkedTask solo toca tareas abiertas de este hilo', async () => {
    const { svc, taskUpdateMany } = makeService();
    await svc.completeLinkedTask('t', 'th1');
    expect(taskUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: {
        source: 'mail-assign',
        sourceRef: 'th1',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      data: { status: 'DONE' },
    });
  });
});

describe('isUnreadForMe — estado leído por usuario', () => {
  const at = (s: string) => new Date(s);

  it('con fila propia manda la fila, no el contador global', () => {
    const thread = { lastMessageAt: at('2026-09-01T10:00Z'), unreadCount: 0 };
    // Leí a las 9, llegó algo a las 10 → sin leer PARA MÍ aunque el global sea 0.
    expect(isUnreadForMe({ lastReadAt: at('2026-09-01T09:00Z') }, thread)).toBe(true);
    // Leí a las 11 → leído para mí aunque el global dijera otra cosa.
    expect(isUnreadForMe({ lastReadAt: at('2026-09-01T11:00Z') }, { ...thread, unreadCount: 3 })).toBe(false);
  });

  it('la fila a epoch (asignación) marca no-leído siempre que haya mensajes', () => {
    expect(
      isUnreadForMe({ lastReadAt: new Date(0) }, { lastMessageAt: at('2026-09-01T10:00Z'), unreadCount: 0 }),
    ).toBe(true);
  });

  it('sin fila cae al contador global: el primer deploy no marca todo como no leído', () => {
    expect(isUnreadForMe(null, { lastMessageAt: at('2026-09-01T10:00Z'), unreadCount: 0 })).toBe(false);
    expect(isUnreadForMe(undefined, { lastMessageAt: at('2026-09-01T10:00Z'), unreadCount: 2 })).toBe(true);
  });

  it('hilo sin mensajes nunca está sin leer', () => {
    expect(isUnreadForMe({ lastReadAt: new Date(0) }, { lastMessageAt: null, unreadCount: 0 })).toBe(false);
  });
});
