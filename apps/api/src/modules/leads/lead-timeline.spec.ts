import { describe, expect, it } from 'vitest';
import { buildLeadTimeline } from './lead-timeline.js';

const d = (s: string) => new Date(s);

const baseLead = {
  source: 'web',
  createdAt: d('2026-01-01T10:00:00Z'),
  contactedAt: null as Date | null,
  qualifiedAt: null as Date | null,
  convertedAt: null as Date | null,
};

describe('buildLeadTimeline', () => {
  it('always emits creation with the source channel in the payload', () => {
    const events = buildLeadTimeline({ lead: baseLead, opportunities: [], conversations: [] });
    expect(events).toEqual([
      { type: 'created', date: '2026-01-01T10:00:00.000Z', source: 'crm', payload: { channel: 'web' } },
    ]);
  });

  it('emits milestones only when their date exists', () => {
    const events = buildLeadTimeline({
      lead: { ...baseLead, contactedAt: d('2026-01-02T00:00:00Z'), convertedAt: d('2026-01-05T00:00:00Z') },
      opportunities: [],
      conversations: [],
    });
    expect(events.map((e) => e.type)).toEqual(['converted', 'contacted', 'created']);
  });

  it('derives a purchase from a WON opportunity (closedAt wins over createdAt)', () => {
    const events = buildLeadTimeline({
      lead: baseLead,
      opportunities: [
        {
          id: 'o1',
          name: 'Plan anual',
          status: 'WON',
          amount: '1200.00',
          currency: 'EUR',
          createdAt: d('2026-01-03T00:00:00Z'),
          closedAt: d('2026-01-10T00:00:00Z'),
        },
      ],
      conversations: [],
    });
    const purchase = events.find((e) => e.type === 'purchase');
    expect(purchase).toMatchObject({
      date: '2026-01-10T00:00:00.000Z',
      source: 'crm',
      payload: { opportunityId: 'o1', name: 'Plan anual', amount: '1200.00', currency: 'EUR' },
    });
    // The opportunity's own creation still shows up as its own event.
    expect(events.some((e) => e.type === 'opportunity' && e.payload.opportunityId === 'o1')).toBe(true);
  });

  it('does not emit purchases for open or lost opportunities', () => {
    const opp = {
      id: 'o1',
      name: 'X',
      amount: null,
      currency: 'EUR',
      createdAt: d('2026-01-03T00:00:00Z'),
      closedAt: null,
    };
    for (const status of ['OPEN', 'QUOTED', 'NEGOTIATING', 'LOST']) {
      const events = buildLeadTimeline({ lead: baseLead, opportunities: [{ ...opp, status }], conversations: [] });
      expect(events.some((e) => e.type === 'purchase')).toBe(false);
    }
  });

  it('emite las compras de e-commerce con su propio source, y una reembolsada lleva refundedAt en el payload', () => {
    const events = buildLeadTimeline({
      lead: baseLead,
      opportunities: [],
      conversations: [],
      purchaseEvents: [
        {
          type: 'purchase',
          source: 'woocommerce',
          occurredAt: d('2026-01-06T00:00:00Z'),
          props: { orderId: '4831', amount: '149.00', currency: 'EUR', name: 'Pedido #4831' },
        },
        {
          type: 'purchase',
          source: 'woocommerce',
          occurredAt: d('2026-01-07T00:00:00Z'),
          props: {
            orderId: '9000',
            amount: '20.00',
            currency: 'EUR',
            name: 'Pedido #9000',
            refundedAt: '2026-01-08T00:00:00.000Z',
          },
        },
      ],
    });
    const purchases = events.filter((e) => e.type === 'purchase' && e.source === 'woocommerce');
    expect(purchases).toHaveLength(2);
    expect(purchases.find((e) => e.payload.orderId === '9000')).toMatchObject({
      payload: expect.objectContaining({ refundedAt: '2026-01-08T00:00:00.000Z' }),
    });
    // Newest first, junto al resto del timeline (mismo orden global).
    expect(events[0]).toMatchObject({ payload: { orderId: '9000' } });
  });

  it('convive con las compras derivadas de Oportunidades ganadas sin colisionar (distinto source)', () => {
    const events = buildLeadTimeline({
      lead: baseLead,
      opportunities: [
        {
          id: 'o1',
          name: 'Plan anual',
          status: 'WON',
          amount: '1200.00',
          currency: 'EUR',
          createdAt: d('2026-01-03T00:00:00Z'),
          closedAt: d('2026-01-05T00:00:00Z'),
        },
      ],
      conversations: [],
      purchaseEvents: [
        {
          type: 'purchase',
          source: 'woocommerce',
          occurredAt: d('2026-01-06T00:00:00Z'),
          props: { orderId: '4831' },
        },
      ],
    });
    const sources = events.filter((e) => e.type === 'purchase').map((e) => e.source);
    expect(sources.sort()).toEqual(['crm', 'woocommerce']);
  });

  it('maps conversations to inbox events with their channel and sorts everything newest-first', () => {
    const events = buildLeadTimeline({
      lead: baseLead,
      opportunities: [],
      conversations: [
        { id: 'c1', channel: 'WHATSAPP', createdAt: d('2026-01-04T00:00:00Z') },
        { id: 'c2', channel: 'EMAIL', createdAt: d('2026-01-02T00:00:00Z') },
      ],
    });
    expect(events.map((e) => e.type)).toEqual(['conversation', 'conversation', 'created']);
    expect(events[0]).toMatchObject({ source: 'inbox', payload: { conversationId: 'c1', channel: 'WHATSAPP' } });
    const dates = events.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
