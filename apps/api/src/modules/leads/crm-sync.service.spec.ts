import { describe, it, expect, vi } from 'vitest';
import { CrmSyncService } from './crm-sync.service.js';

/**
 * Auto-alta de Cliente desde compras de e-commerce: idempotente, respetuosa
 * con decisiones humanas (LOST no se pisa), y con manejo de reembolsos que
 * no toca el status del Lead.
 */
function makePrisma(over: {
  lead?: Record<string, unknown> | null;
  client?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
} = {}) {
  const leadCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'lead-new', ...data }));
  const leadUpdate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'lead1', ...data }));
  const clientFindFirst = vi.fn().mockResolvedValue(over.client ?? null);
  const clientCreate = vi.fn().mockResolvedValue({ id: 'client-new' });
  const eventFindFirst = vi.fn().mockResolvedValue(over.event ?? null);
  const eventUpdate = vi.fn().mockResolvedValue({ id: 'ev1' });

  const tx = {
    lead: {
      findFirst: vi.fn().mockResolvedValue(over.lead === undefined ? null : over.lead),
      create: leadCreate,
      update: leadUpdate,
    },
    client: { findFirst: clientFindFirst, create: clientCreate },
    event: { findFirst: eventFindFirst, update: eventUpdate },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  return { svc: new CrmSyncService(prisma), leadCreate, leadUpdate, clientCreate, eventFindFirst, eventUpdate };
}

const purchase = (over: Record<string, unknown> = {}) => ({
  type: 'purchase',
  occurredAt: new Date('2026-09-01T10:00:00Z'),
  identity: { email: 'ana@empresa.com' },
  props: { orderId: '4831', amount: '149.00', currency: 'EUR', customerName: 'Ana Gómez', ...over },
});

describe('CrmSyncService.onEvent — purchase', () => {
  it('sin email en identity → no-op', async () => {
    const { svc, leadCreate } = makePrisma();
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, { type: 'purchase', identity: {} });
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('comprador nuevo → crea Lead CLIENT con profileId, convertedAt y espejo a Client', async () => {
    const { svc, leadCreate, leadUpdate, clientCreate } = makePrisma();
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, purchase());
    expect(leadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CLIENT',
          source: 'woocommerce',
          profileId: 'p1',
          email: 'ana@empresa.com',
        }),
      }),
    );
    expect(clientCreate).toHaveBeenCalledOnce();
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: 'client-new' }) }),
    );
  });

  it('B2B: props.company alimenta Lead.company al crear', async () => {
    const { svc, leadCreate } = makePrisma();
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, purchase({ company: 'Acme S.L.' }));
    expect(leadCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ company: 'Acme S.L.' }) }),
    );
  });

  it('Lead existente LEAD → se promueve a CLIENT, se estampa convertedAt y se espeja a Client', async () => {
    const { svc, leadUpdate, clientCreate } = makePrisma({
      lead: { id: 'lead1', status: 'LEAD', profileId: null, company: null, clientId: null, convertedAt: null },
    });
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, purchase());
    expect(clientCreate).toHaveBeenCalledOnce();
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead1' },
        data: expect.objectContaining({ status: 'CLIENT', profileId: 'p1', clientId: 'client-new' }),
      }),
    );
  });

  it('Lead existente LOST → NO se toca el status, solo se enlaza profileId si falta', async () => {
    const { svc, leadUpdate } = makePrisma({
      lead: { id: 'lead1', status: 'LOST', profileId: null, company: null, clientId: null },
    });
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, purchase());
    expect(leadUpdate).toHaveBeenCalledWith({ where: { id: 'lead1' }, data: { profileId: 'p1' } });
  });

  it('Lead existente LOST con profileId ya enlazado → no-op total (idempotencia)', async () => {
    const { svc, leadUpdate } = makePrisma({
      lead: { id: 'lead1', status: 'LOST', profileId: 'p1', company: null, clientId: null },
    });
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, purchase());
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('Lead existente CLIENT → no-op de estado, no crea/espeja Client de nuevo', async () => {
    const { svc, leadUpdate, clientCreate } = makePrisma({
      lead: { id: 'lead1', status: 'CLIENT', profileId: 'p1', company: 'Ya tenía', clientId: 'client-old' },
    });
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, purchase({ company: 'Otra empresa' }));
    expect(clientCreate).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled(); // ya tiene profileId y company propios: nada que parchear
  });

  it('doble llamada para el mismo comprador → el mismo patch ambas veces (mismo estado final)', async () => {
    // El mock no simula la escritura real en BD (la fila "existente" no
    // cambia entre llamadas) — lo que importa para idempotencia es que
    // procesar el MISMO evento dos veces produzca el MISMO patch, nunca uno
    // acumulativo o divergente.
    const { svc, leadUpdate } = makePrisma({
      lead: { id: 'lead1', status: 'CLIENT', profileId: 'p1', company: null, clientId: 'client-old' },
    });
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, purchase({ company: 'Acme S.L.' }));
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, purchase({ company: 'Acme S.L.' }));
    expect(leadUpdate).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = leadUpdate.mock.calls;
    expect(firstCall).toEqual(secondCall);
  });
});

describe('CrmSyncService.onEvent — refund', () => {
  it('anota refundedAt/refundAmount en el Event original sin tocar ningún Lead', async () => {
    const { svc, eventUpdate, leadUpdate } = makePrisma({
      event: { id: 'ev1', props: { orderId: '4831', amount: '149.00' } },
    });
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, {
      type: 'refund',
      occurredAt: new Date('2026-09-02T10:00:00Z'),
      props: { orderId: '4831', amount: '149.00' },
    });
    expect(eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ev1' },
        data: { props: expect.objectContaining({ orderId: '4831', refundedAt: expect.any(String), refundAmount: '149.00' }) },
      }),
    );
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('sin orderId o sin Event original → no-op silencioso', async () => {
    const { svc, eventUpdate } = makePrisma({ event: null });
    await svc.onEvent('t1', 'woocommerce', { id: 'p1' }, { type: 'refund', props: { orderId: '9999' } });
    expect(eventUpdate).not.toHaveBeenCalled();
  });
});
