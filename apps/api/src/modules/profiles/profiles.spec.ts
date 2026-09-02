import { describe, it, expect, vi } from 'vitest';
import { ProfilesService } from './profiles.service.js';

/**
 * Resolución de identidad (F1): matching determinista, identidades
 * secundarias sin merges automáticos, y alerta B2B por dominio corporativo.
 */
function makeService(over: {
  existingPrimary?: { profileId: string } | null;
  claimedSecondary?: { profileId: string } | null;
  domainCount?: number;
  recentAlert?: { id: string } | null;
} = {}) {
  const identityFindUnique = vi.fn().mockImplementation(({ where }) => {
    const kind = where.tenantId_kind_value.kind;
    if (kind === 'EMAIL') {
      return Promise.resolve(
        over.existingPrimary ? { ...over.existingPrimary, profile: { id: over.existingPrimary.profileId } } : null,
      );
    }
    return Promise.resolve(over.claimedSecondary ?? null);
  });
  const identityCreate = vi.fn().mockResolvedValue({});
  const profileCreate = vi.fn().mockResolvedValue({ id: 'newProf' });
  const alertCreate = vi.fn().mockResolvedValue({});
  const tx = {
    profileIdentity: {
      findUnique: identityFindUnique,
      create: identityCreate,
      count: vi.fn().mockResolvedValue(over.domainCount ?? 0),
    },
    profile: { create: profileCreate },
    alert: {
      findFirst: vi.fn().mockResolvedValue(over.recentAlert ?? null),
      create: alertCreate,
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  return { svc: new ProfilesService(prisma), tx, identityCreate, profileCreate, alertCreate };
}

describe('ProfilesService.resolveForEvent', () => {
  it('identidad primaria existente → devuelve su perfil sin crear nada', async () => {
    const { svc, profileCreate } = makeService({ existingPrimary: { profileId: 'p1' } });
    const p = await svc.resolveForEvent('t1', { email: 'ana@acme.com' });
    expect(p).toEqual({ id: 'p1' });
    expect(profileCreate).not.toHaveBeenCalled();
  });

  it('identidad nueva → crea perfil con la identidad primaria', async () => {
    const { svc, profileCreate } = makeService();
    const p = await svc.resolveForEvent('t1', { email: 'ana@gmail.com' }, { source: 'brevo' });
    expect(p).toEqual({ id: 'newProf' });
    expect(profileCreate.mock.calls[0]![0].data.identities.create).toMatchObject({
      kind: 'EMAIL',
      value: 'ana@gmail.com',
      source: 'brevo',
    });
  });

  it('la identidad secundaria libre se adjunta al mismo perfil', async () => {
    const { svc, identityCreate } = makeService({ existingPrimary: { profileId: 'p1' } });
    await svc.resolveForEvent('t1', { email: 'ana@acme.com', phone: '+34 600 111 222' });
    expect(identityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileId: 'p1', kind: 'PHONE', value: '+34600111222' }),
      }),
    );
  });

  it('la secundaria reclamada por OTRO perfil no se roba (sin merge en F1)', async () => {
    const { svc, identityCreate } = makeService({
      existingPrimary: { profileId: 'p1' },
      claimedSecondary: { profileId: 'OTRO' },
    });
    await svc.resolveForEvent('t1', { email: 'ana@acme.com', phone: '600111222' });
    expect(identityCreate).not.toHaveBeenCalled();
  });

  it('con umbral alcanzado y dominio corporativo, crea la alerta B2B', async () => {
    const { svc, alertCreate } = makeService({ domainCount: 3 });
    await svc.resolveForEvent('t1', { email: 'cfo@acme.com' });
    expect(alertCreate.mock.calls[0]![0].data).toMatchObject({
      type: 'B2B_DOMAIN',
      resourceId: 'acme.com',
    });
  });

  it('con dominio personal (gmail) jamás alerta, aunque haya muchos', async () => {
    const { svc, alertCreate } = makeService({ domainCount: 50 });
    await svc.resolveForEvent('t1', { email: 'ana@gmail.com' });
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('con alerta viva reciente del dominio, no duplica', async () => {
    const { svc, alertCreate } = makeService({ domainCount: 5, recentAlert: { id: 'a1' } });
    await svc.resolveForEvent('t1', { email: 'cfo@acme.com' });
    expect(alertCreate).not.toHaveBeenCalled();
  });
});
