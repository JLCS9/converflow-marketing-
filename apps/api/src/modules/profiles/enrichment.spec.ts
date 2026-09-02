import { describe, it, expect, vi, afterEach } from 'vitest';
import { EnrichmentService } from './enrichment.service.js';

/**
 * F3 · Enriquecimiento B2B fase 1: dominio corporativo → web pública →
 * perfil estructurado. Sin dominio no hay fetch; con caché fresca no hay
 * gasto; dominios peligrosos (SSRF) nunca se consultan.
 */
function makeService(over: {
  profile?: Record<string, unknown> | null;
  toolOutput?: Record<string, unknown>;
} = {}) {
  const profileUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    profile: {
      findUnique: vi.fn().mockResolvedValue(
        over.profile === undefined
          ? {
              id: 'p1',
              enrichedAt: null,
              enrichment: null,
              identities: [{ value: 'ana@empresa-x.com' }],
            }
          : over.profile,
      ),
      update: profileUpdate,
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const callWithTool = vi.fn().mockResolvedValue({
    result:
      over.toolOutput ?? {
        useful: true,
        sector: 'Formación corporativa',
        summary: 'Cursos de liderazgo para empresas.',
        services: ['Cursos in-company'],
      },
    inputTokens: 80, outputTokens: 40, totalTokens: 120, costUsd: 0.0005, durationMs: 200,
    model: 'claude-haiku-4-5',
  });
  const ai = { callWithTool, modelFor: () => 'claude-haiku-4-5', recordUsage: vi.fn() };
  const svc = new EnrichmentService(prisma, ai as never);
  return { svc, callWithTool, profileUpdate };
}

function stubFetchHtml(html: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve(html),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('EnrichmentService.enrichProfile', () => {
  it('sin dominio corporativo (freemail) → no hay fetch ni gasto', async () => {
    const fetchMock = stubFetchHtml('<html>x</html>');
    const { svc, callWithTool } = makeService({
      profile: { id: 'p1', enrichedAt: null, enrichment: null, identities: [{ value: 'ana@gmail.com' }] },
    });
    const res = await svc.enrichProfile('t1', 'p1');
    expect(res).toEqual({ enriched: false, reason: 'no_corporate_domain' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callWithTool).not.toHaveBeenCalled();
  });

  it('enriquecido hace menos de 30 días → caché, sin fetch', async () => {
    const fetchMock = stubFetchHtml('<html>x</html>');
    const cached = { domain: 'empresa-x.com', sector: 'Formación', source: 'public_web' };
    const { svc, callWithTool } = makeService({
      profile: {
        id: 'p1',
        enrichedAt: new Date(Date.now() - 5 * 86_400_000),
        enrichment: cached,
        identities: [{ value: 'ana@empresa-x.com' }],
      },
    });
    const res = await svc.enrichProfile('t1', 'p1');
    expect(res.enriched).toBe(true);
    expect(res.reason).toBe('cached');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callWithTool).not.toHaveBeenCalled();
  });

  it('página útil → extrae y persiste enrichment estructurado', async () => {
    stubFetchHtml(`<html><body>${'Formación de líderes para empresas. '.repeat(20)}</body></html>`);
    const { svc, profileUpdate } = makeService();
    const res = await svc.enrichProfile('t1', 'p1');
    expect(res.enriched).toBe(true);
    expect(res.enrichment?.sector).toBe('Formación corporativa');
    const data = profileUpdate.mock.calls[0]![0].data;
    expect(data.enrichment.domain).toBe('empresa-x.com');
    expect(data.enrichedAt).toBeInstanceOf(Date);
  });

  it('página inútil (parking) → no persiste nada', async () => {
    stubFetchHtml(`<html><body>${'Dominio en venta contacte registrador. '.repeat(10)}</body></html>`);
    const { svc, profileUpdate } = makeService({ toolOutput: { useful: false } });
    const res = await svc.enrichProfile('t1', 'p1');
    expect(res).toEqual({ enriched: false, reason: 'page_not_useful' });
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('guardarraíl SSRF: IP o localhost como "dominio" → jamás se consulta', async () => {
    const fetchMock = stubFetchHtml('<html>x</html>');
    for (const value of ['ana@192.168.1.10', 'ana@localhost', 'ana@intranet.local']) {
      const { svc } = makeService({
        profile: { id: 'p1', enrichedAt: null, enrichment: null, identities: [{ value }] },
      });
      const res = await svc.enrichProfile('t1', 'p1');
      expect(res.enriched).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
