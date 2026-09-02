import { describe, it, expect, vi } from 'vitest';
import { ConsentsService } from './consents.service.js';

const EV = { at: '2026-09-02T10:00:00Z', where: 'webchat', textShown: 'Acepto que me contactéis.' };

function makeService(current: { id: string; granted: boolean } | null) {
  const consentCreate = vi.fn().mockResolvedValue({ id: 'new' });
  const consentUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    consent: {
      findFirst: vi.fn().mockResolvedValue(current),
      create: consentCreate,
      update: consentUpdate,
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  return { svc: new ConsentsService(prisma), consentCreate, consentUpdate };
}

describe('ConsentsService', () => {
  it('grant sin consentimiento previo crea la fila con evidencia', async () => {
    const { svc, consentCreate } = makeService(null);
    await svc.grant('t1', 'p1', 'whatsapp', 'followup', EV);
    expect(consentCreate.mock.calls[0]![0].data).toMatchObject({
      profileId: 'p1',
      channel: 'whatsapp',
      purpose: 'followup',
      granted: true,
      evidence: EV,
    });
  });

  it('grant con consentimiento vigente positivo es idempotente (no duplica)', async () => {
    const { svc, consentCreate } = makeService({ id: 'c1', granted: true });
    await svc.grant('t1', 'p1', 'whatsapp', 'followup', EV);
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it('grant tras una negativa vigente: revoca la vieja y crea la positiva', async () => {
    const { svc, consentCreate, consentUpdate } = makeService({ id: 'c1', granted: false });
    await svc.grant('t1', 'p1', 'whatsapp', 'followup', EV);
    expect(consentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' } }),
    );
    expect(consentCreate.mock.calls[0]![0].data.granted).toBe(true);
  });

  it('revoke deja evidencia propia de la revocación (append-only)', async () => {
    const { svc, consentCreate, consentUpdate } = makeService({ id: 'c1', granted: true });
    await svc.revoke('t1', 'p1', 'email', 'marketing', { ...EV, where: 'unsubscribe-link' });
    expect(consentUpdate).toHaveBeenCalled();
    expect(consentCreate.mock.calls[0]![0].data).toMatchObject({ granted: false });
  });

  it('hasConsent devuelve true solo con vigente y positivo', async () => {
    expect(await makeService({ id: 'c', granted: true }).svc.hasConsent('t', 'p', 'email', 'mk')).toBe(true);
    expect(await makeService({ id: 'c', granted: false }).svc.hasConsent('t', 'p', 'email', 'mk')).toBe(false);
    expect(await makeService(null).svc.hasConsent('t', 'p', 'email', 'mk')).toBe(false);
  });
});
