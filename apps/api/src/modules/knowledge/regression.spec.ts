import { describe, it, expect, vi } from 'vitest';
import { RegressionService } from './regression.service.js';

/**
 * F4 · Set de regresión: match determinista sobre el contexto recuperado y
 * puerta con rollback para los cambios de conocimiento.
 */
function makeService(over: {
  checks?: Record<string, unknown>[];
  retrieved?: string[];
  retrievedAfterChange?: string[];
} = {}) {
  const checkUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    regressionCheck: {
      findMany: vi.fn().mockResolvedValue(
        over.checks ?? [
          { id: 'r1', question: '¿Cuánto dura el curso?', expect: 'seis semanas', active: true, lastStatus: 'PASS' },
        ],
      ),
      count: vi.fn().mockImplementation(() => Promise.resolve((over.checks ?? [{}]).length)),
      findUnique: vi.fn().mockResolvedValue({ id: 'r1', question: 'q', expect: 'e' }),
      update: checkUpdate,
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;

  let retrieveCalls = 0;
  const knowledge = {
    retrieve: vi.fn().mockImplementation(() => {
      retrieveCalls++;
      const source =
        over.retrievedAfterChange && retrieveCalls > 0 && over.retrievedAfterChange
          ? over.retrievedAfterChange
          : over.retrieved ?? ['El curso dura SEIS semanas con clases en directo.'];
      return Promise.resolve(source.map((content) => ({ kind: 'knowledge', content, distance: 0.2 })));
    }),
    addTextSource: vi.fn().mockResolvedValue({ inserted: 2, sourceRef: 'text:faq' }),
    deleteSource: vi.fn().mockResolvedValue({ ok: true }),
  };
  const rag = {
    renameSourceRef: vi.fn().mockResolvedValue({ renamed: 1 }),
    deleteBySourceRef: vi.fn().mockResolvedValue({ deleted: 1 }),
  };
  const svc = new RegressionService(prisma, knowledge as never, rag as never);
  return { svc, tx, knowledge, rag, checkUpdate };
}

describe('RegressionService.run', () => {
  it('pasa cuando lo esperado aparece (insensible a mayúsculas y acentos)', async () => {
    const { svc } = makeService({
      checks: [{ id: 'r1', question: '¿Duración?', expect: 'séis semanas', active: true, lastStatus: null }],
      retrieved: ['El curso dura SEIS semanas.'],
    });
    const res = await svc.run('t1');
    expect(res.passed).toBe(1);
    expect(res.regressions).toHaveLength(0);
  });

  it('PASS→FAIL es regresión; un check que nunca pasó es solo informativo', async () => {
    const { svc } = makeService({
      checks: [
        { id: 'r1', question: '¿Duración?', expect: 'seis semanas', active: true, lastStatus: 'PASS' },
        { id: 'r2', question: '¿Certificado?', expect: 'certificado oficial', active: true, lastStatus: null },
      ],
      retrieved: ['Contenido que ya no menciona nada de eso.'],
    });
    const res = await svc.run('t1', { commit: false });
    expect(res.regressions.map((r) => r.id)).toEqual(['r1']);
    expect(res.stillFailing.map((r) => r.id)).toEqual(['r2']);
  });
});

describe('RegressionService.guardedAddTextSource', () => {
  const input = { title: 'FAQ', text: 'x'.repeat(30) };

  it('sin checks activos → alta normal en diferido, sin staging', async () => {
    const { svc, knowledge, rag } = makeService({ checks: [] });
    await svc.guardedAddTextSource('t1', input);
    expect(knowledge.addTextSource).toHaveBeenCalledWith('t1', input);
    expect(rag.renameSourceRef).not.toHaveBeenCalled();
  });

  it('regresión detectada → rollback (nuevo fuera, anterior restaurado) y 409', async () => {
    const { svc, rag } = makeService({
      retrieved: ['Contenido nuevo que ya no contiene lo esperado.'],
    });
    await expect(svc.guardedAddTextSource('t1', input)).rejects.toMatchObject({ httpStatus: 409 });
    // staging: ref→#prev; rollback: borrar nuevo + #prev→ref
    expect(rag.renameSourceRef.mock.calls[0]!.slice(2)).toEqual(['text:faq', 'text:faq#prev']);
    expect(rag.renameSourceRef.mock.calls[1]!.slice(2)).toEqual(['text:faq#prev', 'text:faq']);
    const deleted = rag.deleteBySourceRef.mock.calls.map((c) => c[2]);
    expect(deleted).toContain('text:faq');
  });

  it('set en verde → consolida (borra el staging #prev)', async () => {
    const { svc, rag } = makeService({
      retrieved: ['El curso dura seis semanas, como siempre.'],
    });
    const res = await svc.guardedAddTextSource('t1', input);
    expect(res).toMatchObject({ inserted: 2, regression: { total: 1, passed: 1 } });
    const deleted = rag.deleteBySourceRef.mock.calls.map((c) => c[2]);
    expect(deleted).toContain('text:faq#prev');
    // jamás se restaura: solo un rename (el de staging)
    expect(rag.renameSourceRef).toHaveBeenCalledTimes(1);
  });
});

describe('RegressionService.guardedDeleteSource', () => {
  it('la baja que rompe el set queda bloqueada y la fuente restaurada', async () => {
    const { svc, rag } = makeService({
      retrieved: ['Ya no queda contenido relevante.'],
    });
    await expect(svc.guardedDeleteSource('t1', 'text:faq')).rejects.toMatchObject({ httpStatus: 409 });
    expect(rag.renameSourceRef.mock.calls[1]!.slice(2)).toEqual(['text:faq#prev', 'text:faq']);
    expect(rag.deleteBySourceRef).not.toHaveBeenCalled();
  });

  it('la baja inocua se consolida', async () => {
    const { svc, rag } = makeService({
      retrieved: ['El curso dura seis semanas.'],
    });
    const res = await svc.guardedDeleteSource('t1', 'text:vieja');
    expect(res).toEqual({ ok: true });
    expect(rag.deleteBySourceRef.mock.calls[0]!.slice(2)).toEqual(['text:vieja#prev']);
  });
});
