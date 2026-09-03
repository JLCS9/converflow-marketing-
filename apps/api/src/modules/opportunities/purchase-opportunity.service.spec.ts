import { describe, it, expect, vi } from 'vitest';
import { PurchaseOpportunityService } from './purchase-opportunity.service.js';

/**
 * Compra de e-commerce → Oportunidad ganada (una por pedido): nombre real
 * del producto, fecha real del pedido (nunca "ahora"), idempotente, y un
 * reembolso anota sin revertir el status.
 */
/**
 * `over.already`: fila que debe devolver `opportunity.findUnique` en el
 * flujo de compra (dedupe). `over.opp`: fila que debe devolver en el flujo
 * de reembolso (búsqueda de la Oportunidad a anotar). Cada test usa uno u
 * otro — nunca los dos a la vez, así que un único mock estático basta.
 */
function makePrisma(over: {
  already?: Record<string, unknown> | null;
  lead?: Record<string, unknown> | null;
  opp?: Record<string, unknown> | null;
} = {}) {
  const oppFindUnique = vi
    .fn()
    .mockResolvedValue(over.opp !== undefined ? over.opp : (over.already ?? null));
  const oppCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'opp-new', ...data }));
  const stageHistoryCreate = vi.fn().mockResolvedValue({});
  const leadFindFirst = vi.fn().mockResolvedValue(over.lead === undefined ? { id: 'lead1', clientId: 'client1' } : over.lead);
  const noteCreate = vi.fn().mockResolvedValue({});

  const tx = {
    opportunity: { findUnique: oppFindUnique, create: oppCreate },
    opportunityStageHistory: { create: stageHistoryCreate },
    lead: { findFirst: leadFindFirst },
    note: { create: noteCreate },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const pipelines = {
    getDefault: vi.fn().mockResolvedValue({
      id: 'pipe1',
      stages: [
        { id: 's-open', pipelineId: 'pipe1', key: 'OPEN', label: 'Abierto', color: '#000', order: 0, isWon: false, isLost: false },
        { id: 's-won', pipelineId: 'pipe1', key: 'WON', label: 'Ganado', color: '#000', order: 1, isWon: true, isLost: false },
      ],
    }),
  };
  const svc = new PurchaseOpportunityService(prisma, pipelines as never);
  return { svc, oppCreate, oppFindUnique, stageHistoryCreate, leadFindFirst, noteCreate, pipelines };
}

const purchase = (over: Record<string, unknown> = {}) => ({
  type: 'purchase',
  occurredAt: new Date('2026-03-05T10:00:00Z'),
  props: {
    orderId: '4831',
    amount: '149.00',
    currency: 'EUR',
    name: 'Pedido #4831',
    lineItems: [{ productId: '213', name: 'Curso de Excel Avanzado', qty: 1, total: '149.00' }],
    ...over,
  },
});

describe('PurchaseOpportunityService.onEvent — purchase', () => {
  it('crea una Oportunidad WON con el nombre real del producto y la fecha del pedido, no "ahora"', async () => {
    const { svc, oppCreate, stageHistoryCreate } = makePrisma();
    await svc.onEvent('t1', 'src1', { id: 'p1' }, purchase());
    expect(oppCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Curso de Excel Avanzado',
          status: 'WON',
          leadId: 'lead1',
          clientId: 'client1',
          source: 'src1',
          externalId: 'order:4831',
          amount: '149.00',
          currency: 'EUR',
          pipelineId: 'pipe1',
          stageId: 's-won',
          createdAt: new Date('2026-03-05T10:00:00Z'),
          closedAt: new Date('2026-03-05T10:00:00Z'),
        }),
      }),
    );
    expect(stageHistoryCreate).toHaveBeenCalledOnce();
  });

  it('pedido con varios productos → "primero +N más"', async () => {
    const { svc, oppCreate } = makePrisma();
    await svc.onEvent('t1', 'src1', { id: 'p1' }, purchase({
      lineItems: [
        { name: 'Producto A' },
        { name: 'Producto B' },
        { name: 'Producto C' },
      ],
    }));
    expect(oppCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Producto A +2 más' }) }),
    );
  });

  it('sin lineItems (payload viejo/roto) → cae al nombre del pedido', async () => {
    const { svc, oppCreate } = makePrisma();
    await svc.onEvent('t1', 'src1', { id: 'p1' }, purchase({ lineItems: [] }));
    expect(oppCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Pedido #4831' }) }),
    );
  });

  it('ya existe una Oportunidad con ese externalId → no-op (idempotente ante reintentos/backfill)', async () => {
    const { svc, oppCreate } = makePrisma({ already: { id: 'opp-existing' } });
    await svc.onEvent('t1', 'src1', { id: 'p1' }, purchase());
    expect(oppCreate).not.toHaveBeenCalled();
  });

  it('sin Lead resuelto (CrmSyncService no llegó a crear uno) → no-op, no crea Oportunidad huérfana', async () => {
    const { svc, oppCreate } = makePrisma({ lead: null });
    await svc.onEvent('t1', 'src1', { id: 'p1' }, purchase());
    expect(oppCreate).not.toHaveBeenCalled();
  });

  it('sin orderId → no-op silencioso', async () => {
    const { svc, oppCreate } = makePrisma();
    await svc.onEvent('t1', 'src1', { id: 'p1' }, { type: 'purchase', props: {} });
    expect(oppCreate).not.toHaveBeenCalled();
  });

  it('un fallo inesperado no lanza — best-effort, igual que sus vecinos del pipeline', async () => {
    const { svc, pipelines } = makePrisma();
    pipelines.getDefault.mockRejectedValue(new Error('boom'));
    await expect(svc.onEvent('t1', 'src1', { id: 'p1' }, purchase())).resolves.toBeUndefined();
  });
});

describe('PurchaseOpportunityService.onEvent — refund', () => {
  it('añade una nota visible con el importe, sin tocar el status de la Oportunidad', async () => {
    const { svc, noteCreate } = makePrisma({ opp: { id: 'opp1', currency: 'EUR' } });
    await svc.onEvent('t1', 'src1', { id: 'p1' }, {
      type: 'refund',
      occurredAt: new Date('2026-03-10T00:00:00Z'),
      props: { orderId: '4831', amount: '149.00' },
    });
    expect(noteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          opportunityId: 'opp1',
          body: expect.stringContaining('149.00 EUR'),
        }),
      }),
    );
    // Nunca se llama opportunity.update en el flujo de refund — el status no se toca.
  });

  it('sin Oportunidad para ese pedido → no-op silencioso', async () => {
    const { svc, noteCreate } = makePrisma({ opp: null });
    await svc.onEvent('t1', 'src1', { id: 'p1' }, { type: 'refund', props: { orderId: '9999' } });
    expect(noteCreate).not.toHaveBeenCalled();
  });
});
