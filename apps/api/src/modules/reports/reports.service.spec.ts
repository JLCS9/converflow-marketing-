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

/**
 * BUG arreglado: overview() seguía agrupando leads por el modelo legado de
 * 5 estados (NEW/CONTACTED/QUALIFIED/CONVERTED/LOST) — el status real de un
 * Lead vive en el triplete LEAD/CLIENT/LOST desde hace tiempo. Con el mapa
 * viejo, TODO lead moderno (incluidos los de la integración WooCommerce)
 * quedaba sin contar: total de leads, tasa de conversión y el embudo del
 * panel de inicio siempre en cero pese a haber datos reales.
 */
function makeOverviewService(leadsByStatus: { status: string; _count: { _all: number } }[]) {
  const tx = {
    lead: {
      groupBy: vi.fn().mockImplementation(({ by }) =>
        Promise.resolve(by[0] === 'status' ? leadsByStatus : []),
      ),
    },
    opportunity: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    task: { count: vi.fn().mockResolvedValue(0) },
    client: { count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  return { svc: new ReportsService(prisma) };
}

describe('ReportsService.overview — modelo de status del Lead', () => {
  it('cuenta leads con status canónico LEAD/CLIENT/LOST (no solo los 5 valores legacy)', async () => {
    const { svc } = makeOverviewService([
      { status: 'LEAD', _count: { _all: 10 } },
      { status: 'CLIENT', _count: { _all: 4 } },
      { status: 'LOST', _count: { _all: 2 } },
    ]);
    const res = await svc.overview('t1');
    expect(res.leads.total).toBe(16);
    expect(res.leads.byStatus).toEqual(
      expect.arrayContaining([
        { status: 'LEAD', count: 10 },
        { status: 'CLIENT', count: 4 },
        { status: 'LOST', count: 2 },
      ]),
    );
  });

  it('la tasa de conversión sale de CLIENT, no del legacy CONVERTED', async () => {
    const { svc } = makeOverviewService([
      { status: 'LEAD', _count: { _all: 6 } },
      { status: 'CLIENT', _count: { _all: 4 } },
    ]);
    const res = await svc.overview('t1');
    expect(res.leads.conversionRate).toBeCloseTo(0.4);
  });

  it('una fila con status legacy sin migrar (NEW/CONTACTED/QUALIFIED/CONVERTED) se colapsa a su canónico', async () => {
    const { svc } = makeOverviewService([
      { status: 'NEW', _count: { _all: 3 } },
      { status: 'CONTACTED', _count: { _all: 2 } },
      { status: 'CONVERTED', _count: { _all: 5 } },
    ]);
    const res = await svc.overview('t1');
    expect(res.leads.total).toBe(10); // nada se pierde
    expect(res.leads.byStatus.find((s) => s.status === 'LEAD')?.count).toBe(5); // NEW+CONTACTED
    expect(res.leads.byStatus.find((s) => s.status === 'CLIENT')?.count).toBe(5); // CONVERTED
  });
});

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
