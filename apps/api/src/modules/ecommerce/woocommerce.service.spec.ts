import { describe, it, expect, vi } from 'vitest';
import { WoocommerceService } from './woocommerce.service.js';
import { hashApiKey } from '../../common/auth/api-key.util.js';

/**
 * Handshake WooCommerce: clave de conexión de un solo uso → secreto HMAC
 * real generado server-side. Nunca se acepta una clave caducada o repetida.
 */
function makeService(over: { connection?: Record<string, unknown> | null } = {}) {
  const ingestSourceCreate = vi.fn().mockResolvedValue({ id: 'src1' });
  const ingestSourceUpdate = vi.fn().mockResolvedValue({});
  const connCreate = vi.fn().mockResolvedValue({ id: 'conn1' });
  const connUpdate = vi.fn().mockResolvedValue({});
  const connFindUnique = vi.fn().mockResolvedValue(over.connection === undefined ? null : over.connection);

  const tx = {
    ecommerceConnection: { findUnique: connFindUnique, create: connCreate, update: connUpdate },
    ingestSource: { create: ingestSourceCreate, update: ingestSourceUpdate },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
    bypass: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  return { svc: new WoocommerceService(prisma), ingestSourceCreate, ingestSourceUpdate, connCreate, connUpdate, connFindUnique };
}

describe('WoocommerceService.connect', () => {
  it('primera vez: crea IngestSource inactivo + EcommerceConnection con clave y TTL', async () => {
    const { svc, ingestSourceCreate, connCreate } = makeService();
    const res = await svc.connect('t1');
    expect(res.connectionKey).toMatch(/^cfwc_/);
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(ingestSourceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'woocommerce', active: false }) }),
    );
    expect(connCreate).toHaveBeenCalledOnce();
  });

  it('ya conectado antes: regenera la clave sobre la conexión existente, no crea una nueva', async () => {
    const { svc, ingestSourceCreate, connUpdate } = makeService({ connection: { id: 'conn1', ingestSourceId: 'src1' } });
    await svc.connect('t1');
    expect(ingestSourceCreate).not.toHaveBeenCalled();
    expect(connUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conn1' }, data: expect.objectContaining({ connectionKeyPrefix: expect.any(String) }) }),
    );
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
    const svc = makeService({ connection: conn });
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
    const { svc } = makeService({ connection: null });
    await expect(svc.register({ connectionKey: 'cfwc_' + 'c'.repeat(32) })).rejects.toThrow();
  });
});

describe('WoocommerceService.disconnect', () => {
  it('desactiva el IngestSource y marca DISCONNECTED', async () => {
    const { svc, ingestSourceUpdate, connUpdate } = makeService({
      connection: { id: 'conn1', ingestSourceId: 'src1' },
    });
    await svc.disconnect('t1');
    expect(ingestSourceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'src1' }, data: { active: false } }),
    );
    expect(connUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DISCONNECTED' }) }),
    );
  });

  it('sin conexión previa → error visible', async () => {
    const { svc } = makeService({ connection: null });
    await expect(svc.disconnect('t1')).rejects.toThrow();
  });
});
