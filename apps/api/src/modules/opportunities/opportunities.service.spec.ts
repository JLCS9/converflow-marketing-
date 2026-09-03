import { describe, it, expect, vi } from 'vitest';
import { OpportunitiesService } from './opportunities.service.js';

/**
 * Bloque de Inteligencia de Negocio en el tablero: el rango de fechas acota
 * lo CERRADO (closedAt), nunca esconde una oportunidad ABIERTA — el tablero
 * es una herramienta de trabajo del pipeline activo, no solo un informe.
 */
function makeService() {
  const findMany = vi.fn().mockResolvedValue([]);
  const tx = { opportunity: { findMany } };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const svc = new OpportunitiesService(prisma, {} as never, {} as never);
  return { svc, findMany };
}

describe('OpportunitiesService.list — filtro de fechas', () => {
  it('sin from/to → aplica igualmente un rango (últimos 30 días) a lo cerrado', async () => {
    const { svc, findMany } = makeService();
    await svc.list('t1');
    const [{ where }] = findMany.mock.calls[0]!;
    const closedBranch = where.OR.find((c: { status: unknown }) => Array.isArray((c.status as { in: string[] }).in) && (c.status as { in: string[] }).in.includes('WON'));
    expect(closedBranch.closedAt.gte).toBeInstanceOf(Date);
    expect(closedBranch.closedAt.lte.getTime() - closedBranch.closedAt.gte.getTime()).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3);
  });

  it('la rama de abiertas NUNCA lleva filtro de fecha — visibles pase lo que pase con el rango', async () => {
    const { svc, findMany } = makeService();
    await svc.list('t1', { from: new Date('2026-01-01'), to: new Date('2026-01-31') });
    const [{ where }] = findMany.mock.calls[0]!;
    const openBranch = where.OR.find((c: { status: { in: string[] } }) => c.status.in.includes('OPEN'));
    expect(openBranch).toEqual({ status: { in: ['OPEN', 'QUOTED', 'NEGOTIATING'] } });
  });

  it('la rama de cerradas usa exactamente el rango pedido', async () => {
    const { svc, findMany } = makeService();
    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');
    await svc.list('t1', { from, to });
    const [{ where }] = findMany.mock.calls[0]!;
    const closedBranch = where.OR.find((c: { status: { in: string[] } }) => c.status.in.includes('WON'));
    expect(closedBranch.closedAt).toEqual({ gte: from, lte: to });
  });
});
