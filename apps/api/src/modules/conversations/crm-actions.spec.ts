import { describe, it, expect, vi } from 'vitest';
import { CrmActionsService, enabledToolDefs } from './crm-actions.service.js';

/**
 * E1 · Port de las tools CRM del legado: dedupe de oportunidades, enrutado
 * de soporte (topic → keyword → fallback) y selección de tools habilitadas.
 */
function makeService(over: {
  openOpp?: { name: string } | null;
  owner?: { id: string; name: string; email: string } | null;
} = {}) {
  const oppCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o1', ...data }));
  const taskCreate = vi.fn().mockResolvedValue({ id: 'task1' });
  const convUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    opportunity: {
      findFirst: vi.fn().mockResolvedValue(over.openOpp === undefined ? null : over.openOpp),
      create: oppCreate,
      update: vi.fn().mockResolvedValue({}),
    },
    task: { create: taskCreate },
    conversation: { update: convUpdate },
    user: {
      findFirst: vi.fn().mockResolvedValue(
        over.owner === undefined ? { id: 'u1', name: 'María', email: 'maria@x.com' } : over.owner,
      ),
    },
    lead: { findUnique: vi.fn().mockResolvedValue({ name: 'Carlos' }) },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const email = { notifyUser: vi.fn().mockResolvedValue(undefined) };
  const svc = new CrmActionsService(prisma, email as never);
  return { svc, tx, email, oppCreate, taskCreate, convUpdate };
}

const ctx = {
  tenantId: 't1',
  leadId: 'l1',
  conversationId: 'c1',
  userText: 'Tengo un problema con la factura',
  support: {
    enabled: true,
    defaultPriority: 'MEDIUM' as const,
    fallbackOwnerId: 'u9',
    routes: [
      { topic: 'facturación', ownerId: 'u1', keywords: ['factura', 'cobro'] },
      { topic: 'técnico', ownerId: 'u2', keywords: ['error'] },
    ],
  },
};

describe('enabledToolDefs', () => {
  it('solo expone las tools habilitadas; soporte activo autoañade el ticket', () => {
    const defs = enabledToolDefs({ tools: ['create_opportunity'], support: { enabled: true } as never });
    expect(defs.map((d) => d.name).sort()).toEqual(['create_opportunity', 'create_support_task']);
  });

  it('sin config → sin tools', () => {
    expect(enabledToolDefs({})).toEqual([]);
  });
});

describe('CrmActionsService', () => {
  it('create_opportunity con una abierta → NO duplica y lo dice', async () => {
    const { svc, oppCreate } = makeService({ openOpp: { name: 'Curso equipo' } });
    const out = await svc.execute(ctx, 'create_opportunity', { name: 'Otra' });
    expect(out).toContain('Ya existe una oportunidad abierta');
    expect(oppCreate).not.toHaveBeenCalled();
  });

  it('escalate_to_human deja la conversación PENDIENTE y abre ticket si hay soporte', async () => {
    const { svc, convUpdate, taskCreate } = makeService();
    const out = await svc.execute(ctx, 'escalate_to_human', { reason: 'problema con factura' });
    expect(convUpdate.mock.calls[0]![0].data).toEqual({ status: 'PENDING' });
    expect(taskCreate).toHaveBeenCalledOnce();
    expect(out).toContain('María');
  });

  it('enrutado: keyword casa → responsable de la ruta; sin match → fallback', () => {
    const { svc } = makeService();
    expect(svc.resolveSupportOwner(ctx.support, { text: 'no me llegó el cobro' })).toBe('u1');
    expect(svc.resolveSupportOwner(ctx.support, { topic: 'técnico' })).toBe('u2');
    expect(svc.resolveSupportOwner(ctx.support, { text: 'consulta rara' })).toBe('u9');
  });

  it('el email al responsable sale fire-and-forget con el asunto del ticket', async () => {
    const { svc, email } = makeService();
    await svc.execute(ctx, 'create_support_task', { title: 'Factura duplicada', topic: 'facturación' });
    await new Promise((r) => setTimeout(r, 0));
    expect(email.notifyUser.mock.calls[0]![1]).toMatchObject({
      toEmail: 'maria@x.com',
      subject: '[Soporte] Factura duplicada',
    });
  });
});
