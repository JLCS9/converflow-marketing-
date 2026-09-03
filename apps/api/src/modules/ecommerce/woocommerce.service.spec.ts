import { describe, it, expect, vi } from 'vitest';
import { WoocommerceService } from './woocommerce.service.js';
import { hashApiKey } from '../../common/auth/api-key.util.js';

/**
 * Handshake WooCommerce: clave de conexión de un solo uso → secreto HMAC
 * real generado server-side. Nunca se acepta una clave caducada o repetida.
 * Varias tiendas por tenant están soportadas a propósito (p. ej. una
 * instalación de WordPress por idioma del mismo negocio).
 */
function makePrisma(over: { connections?: Record<string, unknown>[]; findOne?: Record<string, unknown> | null } = {}) {
  const ingestSourceCreate = vi.fn().mockImplementation(() => Promise.resolve({ id: `src-${Math.random()}` }));
  const ingestSourceUpdate = vi.fn().mockResolvedValue({});
  const connCreate = vi.fn().mockResolvedValue({ id: 'conn1' });
  const connUpdate = vi.fn().mockResolvedValue({});
  const connFindMany = vi.fn().mockResolvedValue(over.connections ?? []);
  const connFindUnique = vi.fn().mockResolvedValue(over.findOne === undefined ? null : over.findOne);

  const tx = {
    ecommerceConnection: { findMany: connFindMany, findUnique: connFindUnique, create: connCreate, update: connUpdate },
    ingestSource: { create: ingestSourceCreate, update: ingestSourceUpdate },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
    bypass: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  return { svc: new WoocommerceService(prisma), ingestSourceCreate, ingestSourceUpdate, connCreate, connUpdate, connFindMany, connFindUnique };
}

describe('WoocommerceService.connect', () => {
  it('crea SIEMPRE una tienda nueva (IngestSource inactivo + EcommerceConnection con clave y TTL)', async () => {
    const { svc, ingestSourceCreate, connCreate } = makePrisma();
    const res = await svc.connect('t1', 'ES');
    expect(res.connectionKey).toMatch(/^cfwc_/);
    expect(res.connectionId).toBe('conn1');
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(ingestSourceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'woocommerce', active: false, name: 'ES' }) }),
    );
    expect(connCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: 'ES' }) }),
    );
  });

  it('llamarlo dos veces crea DOS conexiones distintas (varias tiendas por tenant)', async () => {
    const { svc, ingestSourceCreate, connCreate } = makePrisma();
    await svc.connect('t1', 'ES');
    await svc.connect('t1', 'EN');
    expect(ingestSourceCreate).toHaveBeenCalledTimes(2);
    expect(connCreate).toHaveBeenCalledTimes(2);
  });

  it('sin label → funciona igual, label queda undefined', async () => {
    const { svc, connCreate } = makePrisma();
    await svc.connect('t1');
    expect(connCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ label: undefined }) }));
  });
});

describe('WoocommerceService.list', () => {
  it('devuelve todas las tiendas del tenant, más de una si las hay', async () => {
    const { svc } = makePrisma({
      connections: [
        { id: 'c1', label: 'ES', status: 'CONNECTED' },
        { id: 'c2', label: 'EN', status: 'PENDING' },
        { id: 'c3', label: 'FR', status: 'CONNECTED' },
      ],
    });
    const res = await svc.list('t1');
    expect(res).toHaveLength(3);
    expect(res.map((c) => c.label)).toEqual(['ES', 'EN', 'FR']);
  });

  it('tenant sin ninguna tienda → lista vacía, no error', async () => {
    const { svc } = makePrisma({ connections: [] });
    expect(await svc.list('t1')).toEqual([]);
  });
});

describe('WoocommerceService.register', () => {
  function makeRegisterService(keyOverrides: Record<string, unknown> = {}) {
    const secret = 'cfwc_' + 'a'.repeat(32);
    const prefix = secret.slice(0, 11);
    const conn = {
      id: 'conn1',
      tenantId: 't1',
      ingestSourceId: 'src1',
      connectionKeyPrefix: prefix,
      connectionKeyHash: hashApiKey(secret),
      connectionKeyExpiresAt: new Date(Date.now() + 60_000),
      ...keyOverrides,
    };
    const svc = makePrisma({ findOne: conn });
    return { ...svc, secret, conn };
  }

  it('clave válida → activa el IngestSource con un secreto HMAC nuevo y marca CONNECTED', async () => {
    const { svc, secret, ingestSourceUpdate, connUpdate } = makeRegisterService();
    const res = await svc.register({ connectionKey: secret, storeName: 'Mi Tienda' });
    expect(res.secret).toBeTruthy();
    expect(res.secret).not.toBe(secret); // el HMAC real es OTRO secreto, generado aquí
    expect(res.eventsWebhookUrl).toContain('/webhooks/src1');
    expect(res.catalogWebhookUrl).toContain('/webhooks/src1/catalog');
    expect(ingestSourceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: true, secret: res.secret }) }),
    );
    expect(connUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONNECTED', connectionKeyHash: null }),
      }),
    );
  });

  it('clave caducada → rechazada, no activa nada', async () => {
    const { svc, secret, ingestSourceUpdate } = makeRegisterService({
      connectionKeyExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(svc.register({ connectionKey: secret })).rejects.toThrow();
    expect(ingestSourceUpdate).not.toHaveBeenCalled();
  });

  it('clave que no coincide con el hash guardado → rechazada', async () => {
    const { svc } = makeRegisterService();
    await expect(svc.register({ connectionKey: 'cfwc_' + 'b'.repeat(32) })).rejects.toThrow();
  });

  it('sin conexión pendiente para ese prefijo → rechazada', async () => {
    const { svc } = makePrisma({ findOne: null });
    await expect(svc.register({ connectionKey: 'cfwc_' + 'c'.repeat(32) })).rejects.toThrow();
  });
});

describe('WoocommerceService.disconnect', () => {
  it('desactiva el IngestSource de ESA tienda y marca DISCONNECTED, sin tocar las demás', async () => {
    const { svc, ingestSourceUpdate, connUpdate } = makePrisma({
      findOne: { id: 'conn2', ingestSourceId: 'src2' },
    });
    await svc.disconnect('t1', 'conn2');
    expect(ingestSourceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'src2' }, data: { active: false } }),
    );
    expect(connUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conn2' }, data: expect.objectContaining({ status: 'DISCONNECTED' }) }),
    );
  });

  it('id de tienda inexistente → error visible', async () => {
    const { svc } = makePrisma({ findOne: null });
    await expect(svc.disconnect('t1', 'no-existe')).rejects.toThrow();
  });
});
