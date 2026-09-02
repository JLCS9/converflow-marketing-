import { describe, it, expect, vi } from 'vitest';
import { RoutingService } from './routing.service.js';

/**
 * Atención autónoma · Enrutado genérico: primera regla que casa gana,
 * validación de acceso del asignado por canal.
 */
function makeService(over: {
  rules?: Record<string, unknown>[];
  user?: Record<string, unknown> | null;
  connection?: Record<string, unknown> | null;
} = {}) {
  const tx = {
    routingRule: {
      findMany: vi.fn().mockResolvedValue(over.rules ?? []),
      findUnique: vi.fn().mockResolvedValue({ id: 'r1' }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r-new', ...data })),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(
        over.user === undefined
          ? { id: 'u1', role: 'AGENT_USER', permissions: null }
          : over.user,
      ),
    },
    mailConnection: {
      findUnique: vi.fn().mockResolvedValue(
        over.connection === undefined
          ? { visibility: 'SHARED', ownerUserId: null, memberUserIds: null }
          : over.connection,
      ),
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const svc = new RoutingService(prisma);
  return { svc, tx };
}

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  channel: 'EMAIL',
  endpointId: null,
  order: 0,
  enabled: true,
  keywords: ['factura'],
  fromDomain: null,
  assignUserId: 'u-maria',
  ...over,
});

describe('RoutingService.match', () => {
  it('primera regla que casa gana (orden)', async () => {
    const { svc } = makeService({
      rules: [
        rule({ id: 'a', order: 0, keywords: ['factura'], assignUserId: 'u-maria' }),
        rule({ id: 'b', order: 1, keywords: ['factura', 'pedido'], assignUserId: 'u-otro' }),
      ],
    });
    const who = await svc.match('t1', {
      channel: 'EMAIL', endpointId: 'c1', subject: 'Duda factura', text: 'hola',
    });
    expect(who).toBe('u-maria');
  });

  it('keywords en OR sobre asunto+cuerpo, insensible a mayúsculas', async () => {
    const { svc } = makeService({ rules: [rule({ keywords: ['FACTURA', 'cobro'] })] });
    expect(await svc.match('t1', { channel: 'EMAIL', endpointId: 'c1', text: 'el COBRO no llegó' })).toBe('u-maria');
    expect(await svc.match('t1', { channel: 'EMAIL', endpointId: 'c1', text: 'consulta general' })).toBeNull();
  });

  it('fromDomain es AND con las keywords', async () => {
    const { svc } = makeService({ rules: [rule({ fromDomain: 'acme.com' })] });
    expect(
      await svc.match('t1', { channel: 'EMAIL', endpointId: 'c1', text: 'factura', fromAddress: 'ana@acme.com' }),
    ).toBe('u-maria');
    expect(
      await svc.match('t1', { channel: 'EMAIL', endpointId: 'c1', text: 'factura', fromAddress: 'ana@otro.com' }),
    ).toBeNull();
  });

  it('funciona igual para canales de bots (multicanal real)', async () => {
    const { svc } = makeService({ rules: [rule({ channel: 'WEBCHAT', keywords: ['soporte'] })] });
    expect(await svc.match('t1', { channel: 'WEBCHAT', endpointId: 'bot1', text: 'necesito soporte' })).toBe('u-maria');
  });
});

describe('RoutingService.upsert — validaciones', () => {
  it('regla sin criterios → rechazada', async () => {
    const { svc } = makeService();
    await expect(
      svc.upsert('t1', { channel: 'EMAIL', name: 'Vacía', assignUserId: 'u1' }),
    ).rejects.toThrow(/palabra clave o un dominio/);
  });

  it('asignado inactivo o inexistente → rechazado', async () => {
    const { svc } = makeService({ user: null });
    await expect(
      svc.upsert('t1', { channel: 'EMAIL', name: 'X', keywords: ['a'], assignUserId: 'u-fantasma' }),
    ).rejects.toThrow(/no existe o no está activo/);
  });

  it('asignado sin permiso de conversaciones → rechazado', async () => {
    const { svc } = makeService({ user: { id: 'u1', role: 'BUILDER', permissions: ['settings'] } });
    await expect(
      svc.upsert('t1', { channel: 'EMAIL', name: 'X', keywords: ['a'], assignUserId: 'u1' }),
    ).rejects.toThrow(/permiso de conversaciones/);
  });

  it('bandeja con «Solo estas personas»: no-miembro → rechazado; miembro → ok', async () => {
    const conn = { visibility: 'SHARED', ownerUserId: null, memberUserIds: ['u-maria'] };
    const noMember = makeService({ connection: conn });
    await expect(
      noMember.svc.upsert('t1', {
        channel: 'EMAIL', endpointId: 'c1', name: 'X', keywords: ['a'], assignUserId: 'u1',
      }),
    ).rejects.toThrow(/acceso a esa bandeja/);

    const member = makeService({
      connection: conn,
      user: { id: 'u-maria', role: 'AGENT_USER', permissions: null },
    });
    await expect(
      member.svc.upsert('t1', {
        channel: 'EMAIL', endpointId: 'c1', name: 'X', keywords: ['a'], assignUserId: 'u-maria',
      }),
    ).resolves.toMatchObject({ assignUserId: 'u-maria' });
  });
});
