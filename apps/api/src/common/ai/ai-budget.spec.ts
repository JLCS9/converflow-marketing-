import { describe, it, expect, vi } from 'vitest';
import { AiBudgetService } from './ai-budget.service.js';

/**
 * Nada limitaba el gasto de IA. Cada mensaje entrante disparaba un bucle de
 * agente (varias llamadas al modelo con contexto creciente) o una
 * clasificación, sin interruptor, así que una bandeja activa podía consumir
 * indefinidamente y el único sitio donde se veía era la factura del proveedor.
 */
function makeService(tenant: { aiMonthlyTokenCap: number | null; aiInboundAnalysis: boolean }, used: number) {
  const prisma = {
    bypass: (fn: (tx: unknown) => unknown) => Promise.resolve(fn({ tenant: { findUnique: () => tenant } })),
    withTenant: (_t: string, fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({ aiUsage: { aggregate: () => ({ _sum: { totalTokens: used } }) } })),
  } as never;
  return new AiBudgetService(prisma);
}

describe('AiBudgetService', () => {
  it('sin tope configurado no bloquea nada', async () => {
    const svc = makeService({ aiMonthlyTokenCap: null, aiInboundAnalysis: true }, 99_999_999);
    await expect(svc.assertWithinBudget('t1')).resolves.toBeUndefined();
  });

  it('deja pasar mientras queda margen', async () => {
    const svc = makeService({ aiMonthlyTokenCap: 1000, aiInboundAnalysis: true }, 999);
    await expect(svc.assertWithinBudget('t1')).resolves.toBeUndefined();
  });

  it('corta al alcanzar el tope, no al superarlo', async () => {
    const svc = makeService({ aiMonthlyTokenCap: 1000, aiInboundAnalysis: true }, 1000);
    await expect(svc.assertWithinBudget('t1')).rejects.toThrow(/límite mensual/i);
  });

  it('el mensaje del tope no menciona al proveedor de IA', async () => {
    const svc = makeService({ aiMonthlyTokenCap: 10, aiInboundAnalysis: true }, 10);
    await expect(svc.assertWithinBudget('t1')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringMatching(/anthropic|claude|openai/i) }) as never,
    );
  });

  it('refleja el interruptor de análisis automático', async () => {
    expect(
      await makeService({ aiMonthlyTokenCap: null, aiInboundAnalysis: false }, 0).inboundAnalysisEnabled('t1'),
    ).toBe(false);
    expect(
      await makeService({ aiMonthlyTokenCap: null, aiInboundAnalysis: true }, 0).inboundAnalysisEnabled('t1'),
    ).toBe(true);
  });

  it('addSpend hace que el tope muerda dentro del mismo minuto', async () => {
    const svc = makeService({ aiMonthlyTokenCap: 1000, aiInboundAnalysis: true }, 900);
    await expect(svc.assertWithinBudget('t1')).resolves.toBeUndefined();
    svc.addSpend('t1', 200); // se pasa sin esperar a que caduque la caché
    await expect(svc.assertWithinBudget('t1')).rejects.toThrow(/límite mensual/i);
  });

  it('status devuelve el margen restante para la pantalla de ajustes', async () => {
    const svc = makeService({ aiMonthlyTokenCap: 1000, aiInboundAnalysis: true }, 250);
    expect(await svc.status('t1')).toMatchObject({ tokensThisMonth: 250, cap: 1000, remaining: 750 });
  });

  it('sin tope, remaining es null y no 0', async () => {
    const svc = makeService({ aiMonthlyTokenCap: null, aiInboundAnalysis: true }, 250);
    expect((await svc.status('t1')).remaining).toBeNull();
  });
});
