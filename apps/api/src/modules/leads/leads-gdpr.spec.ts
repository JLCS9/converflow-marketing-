import { describe, it, expect, vi } from 'vitest';
import { LeadsService } from './leads.service.js';

/**
 * Borrado RGPD (deuda corregida en F1): el borrado del lead debe eliminar sus
 * conversaciones (con mensajes por cascade), su perfil del plano de datos, y
 * dejar entrada de auditoría SIN datos personales — exactamente lo que
 * promete el diálogo de la UI.
 */
function makeService(over: { profileId?: string | null } = {}) {
  const convDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
  const profileDelete = vi.fn().mockResolvedValue({});
  const leadDelete = vi.fn().mockResolvedValue({});
  const logCreate = vi.fn().mockResolvedValue({});
  const tx = {
    lead: {
      findUnique: vi.fn().mockResolvedValue({ id: 'l1', profileId: over.profileId ?? null }),
      delete: leadDelete,
    },
    conversation: { deleteMany: convDeleteMany },
    profile: { delete: profileDelete },
    accessLog: { create: logCreate },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const svc = new LeadsService(prisma, {} as never, {} as never);
  return { svc, convDeleteMany, profileDelete, leadDelete, logCreate };
}

describe('LeadsService.remove — borrado RGPD', () => {
  it('elimina conversaciones, lead y deja auditoría sin PII', async () => {
    const { svc, convDeleteMany, leadDelete, logCreate } = makeService();
    await svc.remove('t1', 'l1', 'maria@local.test');
    expect(convDeleteMany).toHaveBeenCalledWith({ where: { leadId: 'l1' } });
    expect(leadDelete).toHaveBeenCalled();
    const log = logCreate.mock.calls[0]![0].data;
    expect(log).toMatchObject({ action: 'gdpr.lead_delete', resource: 'lead:l1', success: true });
    // sin PII: ni nombre, ni email, ni teléfono del contacto en la entrada
    expect(JSON.stringify(log)).not.toMatch(/@acme|ana|\+34/i);
  });

  it('si el lead tiene perfil del plano de datos, también lo elimina', async () => {
    const { svc, profileDelete } = makeService({ profileId: 'prof9' });
    await svc.remove('t1', 'l1');
    expect(profileDelete).toHaveBeenCalledWith({ where: { id: 'prof9' } });
  });

  it('sin perfil vinculado no intenta borrar perfiles', async () => {
    const { svc, profileDelete } = makeService({ profileId: null });
    await svc.remove('t1', 'l1');
    expect(profileDelete).not.toHaveBeenCalled();
  });
});
