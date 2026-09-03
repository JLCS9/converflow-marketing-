import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhooksController } from './webhooks.controller.js';

/**
 * Receptor de webhooks: el `source` que llega al pipe de ingesta debe ser
 * el id de LA FUENTE concreta, no el nombre genérico del adaptador — varias
 * fuentes del mismo kind (p. ej. varias tiendas WooCommerce del mismo
 * tenant) no deben compartir espacio de dedupe/catálogo entre ellas.
 */
function makeController(over: { source?: Record<string, unknown> | null } = {}) {
  const source =
    over.source === undefined
      ? { id: 'src-es', tenantId: 't1', kind: 'woocommerce', active: true, secret: null }
      : over.source;
  const ingestSourceUpdate = vi.fn().mockResolvedValue({});
  const ecommerceUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    bypass: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({ ingestSource: { findUnique: vi.fn().mockResolvedValue(source), update: ingestSourceUpdate } })),
    withTenant: (_t: string, fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({ ecommerceConnection: { updateMany: ecommerceUpdateMany } })),
  } as never;
  const queue = { enqueueBatch: vi.fn().mockResolvedValue(undefined) };
  const profiles = { resolveForEvent: vi.fn() };
  const consents = { revoke: vi.fn() };
  const upsertBatch = vi.fn().mockResolvedValue({ upserted: 2 });
  const catalog = { upsertBatch };
  const controller = new WebhooksController(prisma, queue as never, profiles as never, consents as never, catalog as never);
  return { controller, queue, ingestSourceUpdate, ecommerceUpdateMany, upsertBatch };
}

const req = () => ({ rawBody: undefined }) as never;

describe('WebhooksController.receive', () => {
  it('sobrescribe batch.source con el id de la fuente, no el nombre del adaptador', async () => {
    const { controller, queue } = makeController();
    await controller.receive(
      'src-es',
      { events: [{ type: 'purchase', externalId: 'order:1', identity: { email: 'a@b.com' } }] },
      req(),
    );
    expect(queue.enqueueBatch).toHaveBeenCalledWith('t1', expect.objectContaining({ source: 'src-es' }));
  });

  it('dos fuentes WooCommerce distintas del mismo tenant producen batch.source distinto', async () => {
    const a = makeController({ source: { id: 'src-es', tenantId: 't1', kind: 'woocommerce', active: true, secret: null } });
    const b = makeController({ source: { id: 'src-en', tenantId: 't1', kind: 'woocommerce', active: true, secret: null } });
    await a.controller.receive('src-es', { events: [{ type: 'purchase', externalId: 'order:1' }] }, req());
    await b.controller.receive('src-en', { events: [{ type: 'purchase', externalId: 'order:1' }] }, req());
    expect(a.queue.enqueueBatch).toHaveBeenCalledWith('t1', expect.objectContaining({ source: 'src-es' }));
    expect(b.queue.enqueueBatch).toHaveBeenCalledWith('t1', expect.objectContaining({ source: 'src-en' }));
  });

  it('fuente inactiva o inexistente → NotFoundError', async () => {
    const { controller } = makeController({ source: null });
    await expect(controller.receive('nope', {}, req())).rejects.toThrow();
  });

  it('firma HMAC inválida → UnauthorizedError', async () => {
    const { controller } = makeController({
      source: { id: 'src-es', tenantId: 't1', kind: 'woocommerce', active: true, secret: 'shh' },
    });
    await expect(
      controller.receive('src-es', { events: [] }, { rawBody: Buffer.from('{}') } as never, undefined, undefined),
    ).rejects.toThrow();
  });

  it('firma HMAC válida → acepta', async () => {
    const raw = Buffer.from('{"events":[]}');
    const sig = createHmac('sha256', 'shh').update(raw).digest('base64');
    const { controller } = makeController({
      source: { id: 'src-es', tenantId: 't1', kind: 'woocommerce', active: true, secret: 'shh' },
    });
    const res = await controller.receive('src-es', { events: [] }, { rawBody: raw } as never, sig, undefined);
    expect(res).toEqual({ accepted: 0 });
  });
});

describe('WebhooksController.receiveCatalog', () => {
  it('llama a CatalogService.upsertBatch con source.id (no source.kind)', async () => {
    const { controller, upsertBatch } = makeController();
    await controller.receiveCatalog(
      'src-es',
      { items: [{ externalId: '1', name: 'Producto', currency: 'EUR' }] },
      req(),
    );
    expect(upsertBatch).toHaveBeenCalledWith('t1', 'src-es', expect.any(Array));
  });

  it('incrementa productsImported de la EcommerceConnection de esa fuente', async () => {
    const { controller, ecommerceUpdateMany } = makeController();
    await controller.receiveCatalog(
      'src-es',
      { items: [{ externalId: '1', name: 'Producto', currency: 'EUR' }] },
      req(),
    );
    expect(ecommerceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ingestSourceId: 'src-es' },
        data: expect.objectContaining({ productsImported: { increment: 2 } }),
      }),
    );
  });

  it('payload sin items válidos → 0 upserted, sin tocar el contador', async () => {
    const { controller, upsertBatch, ecommerceUpdateMany } = makeController();
    const res = await controller.receiveCatalog('src-es', { items: 'basura' }, req());
    expect(res).toEqual({ upserted: 0 });
    expect(upsertBatch).not.toHaveBeenCalled();
    expect(ecommerceUpdateMany).not.toHaveBeenCalled();
  });
});
