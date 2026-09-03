import { describe, it, expect, vi } from 'vitest';
import { CatalogService } from './catalog.service.js';

/**
 * Catálogo: upsert por lote, idempotente, sin resolución de identidad ni
 * disparo de automatizaciones (es una tabla de referencia, no un evento).
 */
function makePrisma() {
  const upsert = vi.fn().mockResolvedValue({ id: 'c1' });
  const tx = { catalogItem: { upsert } };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  return { svc: new CatalogService(prisma), upsert };
}

describe('CatalogService.upsertBatch', () => {
  it('upserta cada item por [tenantId, source, externalId]', async () => {
    const { svc, upsert } = makePrisma();
    const res = await svc.upsertBatch('t1', 'woocommerce', [
      { externalId: '213', kind: 'product', name: 'Producto A', currency: 'EUR', available: true },
    ]);
    expect(res.upserted).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_source_externalId: { tenantId: 't1', source: 'woocommerce', externalId: '213' } },
      }),
    );
  });

  it('una variante de producto lleva meta.parentId', async () => {
    const { svc, upsert } = makePrisma();
    await svc.upsertBatch('t1', 'woocommerce', [
      {
        externalId: '214',
        kind: 'product',
        name: 'Camiseta azul talla M',
        currency: 'EUR',
        available: true,
        meta: { parentId: '213' },
      },
    ]);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ meta: { parentId: '213' } }) }),
    );
  });

  it('un producto borrado en origen llega con available:false — soft delete, nunca DELETE', async () => {
    const { svc, upsert } = makePrisma();
    await svc.upsertBatch('t1', 'woocommerce', [
      { externalId: '213', kind: 'product', name: 'Producto A', currency: 'EUR', available: false },
    ]);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ available: false }) }),
    );
  });

  it('lote de varios items → un upsert por item', async () => {
    const { svc, upsert } = makePrisma();
    await svc.upsertBatch('t1', 'woocommerce', [
      { externalId: '1', kind: 'product', name: 'A', currency: 'EUR', available: true },
      { externalId: '2', kind: 'product', name: 'B', currency: 'EUR', available: true },
    ]);
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
