import { describe, it, expect, vi } from 'vitest';
import { ReportsService } from './reports.service.js';

/**
 * Bloque de Inteligencia de Negocio: `economics()` es el único agregado con
 * rango de fechas configurable (default últimos 30 días) — ni `overview()`
 * (todo-el-tiempo) ni `series()` (ventana fija de 14 días) lo tenían.
 */
function makeService(over: {
  won?: { count: number; sum: string | null };
  open?: { count: number; sum: string | null };
} = {}) {
  const won = over.won ?? { count: 0, sum: null };
  const open = over.open ?? { count: 0, sum: null };
  const aggregate = vi.fn().mockImplementation(({ where }) => {
    const hit = where.status === 'WON' ? won : open;
    return Promise.resolve({ _count: { _all: hit.count }, _sum: { amount: hit.sum } });
  });
  const tx = { opportunity: { aggregate } };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  return { svc: new ReportsService(prisma), aggregate };
}

describe('ReportsService.economics', () => {
  it('sin from/to → usa los últimos 30 días por defecto', async () => {
    const { svc, aggregate } = makeService();
    const before = Date.now();
    await svc.economics('t1');
    const [{ where: wonWhere }] = aggregate.mock.calls[0]!;
    const from = wonWhere.closedAt.gte.getTime();
    const to = wonWhere.closedAt.lte.getTime();
    expect(to - before).toBeLessThan(5000); // "to" ≈ ahora
    expect(to - from).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3);
  });

  it('calcula ingresos, pedidos y ticket medio a partir de las ganadas', async () => {
    const { svc } = makeService({ won: { count: 4, sum: '596.00' } });
    const res = await svc.economics('t1', { from: new Date('2026-03-01'), to: new Date('2026-03-31') });
    expect(res.orders).toBe(4);
    expect(res.revenue).toBe(596);
    expect(res.avgTicket).toBe(149);
  });

  it('sin ninguna venta ganada en el rango → ticket medio 0, no división por cero', async () => {
    const { svc } = makeService({ won: { count: 0, sum: null } });
    const res = await svc.economics('t1', { from: new Date('2026-03-01'), to: new Date('2026-03-31') });
    expect(res.avgTicket).toBe(0);
  });

  it('source="automated" filtra por cualquier procedencia no nula, no solo woocommerce', async () => {
    const { svc, aggregate } = makeService();
    await svc.economics('t1', { source: 'automated' });
    const [{ where: wonWhere }] = aggregate.mock.calls[0]!;
    expect(wonWhere.source).toEqual({ not: null });
  });

  it('source="woocommerce" filtra por esa procedencia exacta', async () => {
    const { svc, aggregate } = makeService();
    await svc.economics('t1', { source: 'woocommerce' });
    const [{ where: wonWhere }] = aggregate.mock.calls[0]!;
    expect(wonWhere.source).toBe('woocommerce');
  });

  it('sin source → sin filtro de procedencia (todo el pipeline comercial)', async () => {
    const { svc, aggregate } = makeService();
    await svc.economics('t1');
    const [{ where: wonWhere }] = aggregate.mock.calls[0]!;
    expect(wonWhere.source).toBeUndefined();
  });
});
