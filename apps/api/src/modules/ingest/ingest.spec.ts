import { describe, it, expect, vi } from 'vitest';
import { IngestService } from './ingest.service.js';
import { corporateDomainOf, normalizeIdentity } from '../profiles/profiles.service.js';

/**
 * Plano de datos (F1): el procesador deduplica por externalId, resuelve
 * identidad y solo dispara el ciclo de vida para eventos NUEVOS.
 */
function makeService(over: { duplicateOnSecond?: boolean } = {}) {
  let creates = 0;
  const eventCreate = vi.fn().mockImplementation(() => {
    creates++;
    if (over.duplicateOnSecond && creates === 2) {
      const err = new Error('unique') as Error & { code: string };
      err.code = 'P2002';
      throw err;
    }
    return Promise.resolve({});
  });
  const tx = { event: { create: eventCreate } };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
    bypass: vi.fn(),
  } as never;
  const profiles = {
    resolveForEvent: vi.fn().mockResolvedValue({ id: 'prof1' }),
  };
  const lifecycle = { applyEvent: vi.fn().mockResolvedValue('alumno'), sweep: vi.fn() };
  const queue = { registerProcessor: vi.fn(), scheduleSweep: vi.fn(), scheduleMonthlyReport: vi.fn(), scheduleReportPoll: vi.fn().mockResolvedValue(undefined), enqueueBatch: vi.fn(), enqueueEmbed: vi.fn() };
  const rag = { embedPending: vi.fn().mockResolvedValue({ embedded: 0 }) };
  const playbooks = {
    onEvent: vi.fn().mockResolvedValue(undefined),
    onTransition: vi.fn().mockResolvedValue(undefined),
  };
  const reports = { generate: vi.fn(), pollPendingNarratives: vi.fn() };
  const svc = new IngestService(
    prisma, profiles as never, lifecycle as never, queue as never, rag as never, playbooks as never,
    reports as never,
  );
  return { svc, eventCreate, profiles, lifecycle, queue, playbooks };
}

const batch = (n: number) => ({
  source: 'learndash',
  events: Array.from({ length: n }, (_, i) => ({
    type: 'enrollment',
    externalId: `ext-${i}`,
    identity: { email: `Ana+${i}@Empresa.com` },
  })),
});

describe('IngestService.processBatch', () => {
  it('resuelve identidad, escribe el evento y dispara el ciclo de vida', async () => {
    const { svc, eventCreate, profiles, lifecycle } = makeService();
    const res = await svc.processBatch('t1', batch(1) as never);
    expect(res).toEqual({ accepted: 1, deduped: 0 });
    expect(profiles.resolveForEvent).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ email: 'ana+0@empresa.com' }),
      { source: 'learndash' },
    );
    expect(eventCreate.mock.calls[0]![0].data).toMatchObject({
      tenantId: 't1',
      profileId: 'prof1',
      type: 'enrollment',
      source: 'learndash',
      externalId: 'ext-0',
    });
    expect(lifecycle.applyEvent).toHaveBeenCalledWith('t1', 'prof1', 'enrollment');
  });

  it('un webhook reentregado (P2002) se deduplica y NO transiciona estados', async () => {
    const { svc, lifecycle } = makeService({ duplicateOnSecond: true });
    const res = await svc.processBatch('t1', batch(2) as never);
    expect(res).toEqual({ accepted: 1, deduped: 1 });
    expect(lifecycle.applyEvent).toHaveBeenCalledTimes(1);
  });

  it('eventos sin identidad se aceptan sin perfil ni ciclo de vida', async () => {
    const { svc, profiles, lifecycle, eventCreate } = makeService();
    const res = await svc.processBatch('t1', {
      source: 'api',
      events: [{ type: 'catalog_sync' }],
    } as never);
    expect(res.accepted).toBe(1);
    expect(profiles.resolveForEvent).not.toHaveBeenCalled();
    expect(lifecycle.applyEvent).not.toHaveBeenCalled();
    expect(eventCreate.mock.calls[0]![0].data.profileId).toBeUndefined();
  });

  it('ingestBatch valida y encola (202): no escribe nada en línea', async () => {
    const { svc, queue, eventCreate } = makeService();
    const res = await svc.ingestBatch('t1', batch(3) as never);
    expect(res).toEqual({ queued: true, events: 3 });
    expect(queue.enqueueBatch).toHaveBeenCalledTimes(1);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('un payload inválido revienta ANTES de encolar', async () => {
    const { svc, queue } = makeService();
    await expect(
      svc.ingestBatch('t1', { source: 'X MAYUS', events: [{ type: 'ok_type' }] } as never),
    ).rejects.toThrow();
    expect(queue.enqueueBatch).not.toHaveBeenCalled();
  });
});

describe('identidad — helpers', () => {
  it('normaliza email a minúsculas y teléfono sin separadores', () => {
    expect(normalizeIdentity('EMAIL', ' Ana@Empresa.COM ')).toBe('ana@empresa.com');
    expect(normalizeIdentity('PHONE', '+34 600-111.222')).toBe('+34600111222');
  });

  it('corporateDomainOf ignora dominios personales', () => {
    expect(corporateDomainOf('ana@acme.com')).toBe('acme.com');
    expect(corporateDomainOf('ana@gmail.com')).toBeNull();
    expect(corporateDomainOf('ana@Outlook.es'.toLowerCase())).toBeNull();
  });
});
