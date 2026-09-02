import { describe, it, expect, vi } from 'vitest';
import { AiReportsService } from './ai-reports.service.js';

/**
 * F4 · Informe mensual: métricas deterministas + narrativa vía Batch API.
 */
function makeService(over: {
  engineUsage?: { metadata: unknown }[];
  batchResults?: Map<string, string> | null;
  pending?: { id: string; tenantId: string; batchId: string }[];
} = {}) {
  const reportUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    aiUsage: {
      findMany: vi.fn().mockResolvedValue(
        over.engineUsage ?? [
          { metadata: { canAnswer: true } },
          { metadata: { canAnswer: true } },
          { metadata: { canAnswer: false } },
        ],
      ),
      aggregate: vi.fn().mockResolvedValue({ _sum: { costUsd: 1.234 }, _count: { id: 42 } }),
    },
    knowledgeGap: { count: vi.fn().mockResolvedValue(2) },
    verifiedAnswer: {
      findMany: vi.fn().mockResolvedValue([
        { meta: { source: 'human_correction' } },
        { meta: {} },
      ]),
    },
    consent: { count: vi.fn().mockResolvedValue(3) },
    playbookRun: {
      findMany: vi.fn().mockResolvedValue([
        { status: 'SENT', meta: { outcome: 'replied' } },
        { status: 'SUPPRESSED', meta: {} },
      ]),
    },
    lifecycleState: {
      groupBy: vi.fn().mockResolvedValue([{ state: 'alumno', _count: { state: 5 } }]),
    },
    monthlyReport: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'rep1' }),
      update: reportUpdate,
      findUnique: vi.fn().mockResolvedValue({ id: 'rep1', month: '2026-08' }),
      findMany: vi.fn().mockResolvedValue(over.pending ?? []),
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
    bypass: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const ai = {
    modelFor: () => 'claude-sonnet-4-6',
    batchCreate: vi.fn().mockResolvedValue('batch_abc'),
    batchResults: vi.fn().mockResolvedValue(over.batchResults === undefined ? null : over.batchResults),
  };
  const svc = new AiReportsService(prisma, ai as never);
  return { svc, tx, ai, reportUpdate };
}

describe('AiReportsService.computeMetrics', () => {
  it('tasa de resolución sin humano = canAnswer true / turnos', async () => {
    const { svc } = makeService();
    const m = await svc.computeMetrics('t1', '2026-08');
    expect(m.engine).toEqual({ turns: 3, resolved: 2, resolutionRate: 2 / 3 });
    expect(m.verified).toEqual({ created: 2, fromCorrections: 1 });
    expect(m.playbooks).toEqual({ sent: 1, replied: 1, suppressed: 1 });
    expect(m.lifecycle).toEqual({ alumno: 5 });
    expect(m.ai.costUsd).toBe(1.23);
  });

  it('mes inválido → 400', async () => {
    const { svc } = makeService();
    await expect(svc.computeMetrics('t1', '2026-13')).rejects.toThrow(/Mes inválido/);
    await expect(svc.computeMetrics('t1', 'agosto')).rejects.toThrow(/Mes inválido/);
  });
});

describe('AiReportsService.generate', () => {
  it('guarda métricas y encola la narrativa en batch (id persistido)', async () => {
    const { svc, tx, ai, reportUpdate } = makeService();
    await svc.generate('t1', '2026-08');
    expect(tx.monthlyReport.upsert).toHaveBeenCalledOnce();
    expect(ai.batchCreate).toHaveBeenCalledOnce();
    expect(ai.batchCreate.mock.calls[0]![0][0].customId).toBe('report-rep1');
    expect(reportUpdate.mock.calls[0]![0].data).toEqual({ batchId: 'batch_abc' });
  });

  it('si el batch no puede enviarse, las métricas quedan igualmente', async () => {
    const { svc, tx, ai } = makeService();
    ai.batchCreate.mockRejectedValue(new Error('sin clave'));
    const res = await svc.generate('t1', '2026-08');
    expect(tx.monthlyReport.upsert).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ id: 'rep1' });
  });
});

describe('AiReportsService.pollPendingNarratives', () => {
  it('batch aún en curso → no toca nada', async () => {
    const { svc, reportUpdate } = makeService({
      pending: [{ id: 'rep1', tenantId: 't1', batchId: 'batch_abc' }],
      batchResults: null,
    });
    const res = await svc.pollPendingNarratives();
    expect(res.collected).toBe(0);
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it('batch terminado → escribe la narrativa y limpia el batchId', async () => {
    const { svc, reportUpdate } = makeService({
      pending: [{ id: 'rep1', tenantId: 't1', batchId: 'batch_abc' }],
      batchResults: new Map([['report-rep1', 'El asistente resolvió el 66% sin ayuda.']]),
    });
    const res = await svc.pollPendingNarratives();
    expect(res.collected).toBe(1);
    expect(reportUpdate.mock.calls[0]![0].data).toEqual({
      narrative: 'El asistente resolvió el 66% sin ayuda.',
      batchId: null,
    });
  });
});
