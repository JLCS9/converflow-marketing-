/**
 * Derived lead timeline (Bloque 3). No dedicated table: events are computed
 * from data that already exists (lead milestones, opportunities,
 * conversations). The contract is deliberately open —
 * `{ type, date, source, payload }` — so future producers (e.g. AI summaries)
 * only need to emit a new `type`; the frontend renders unknown types with a
 * generic fallback and requires zero component changes.
 */

export interface LeadTimelineEvent {
  /** Open enum: 'created' | 'contacted' | 'qualified' | 'converted' | 'opportunity' | 'purchase' | 'conversation' | future types. */
  type: string;
  /** ISO date the event happened. */
  date: string;
  /** Producing module ('crm', 'inbox', …) — lets the UI attribute/filter later. */
  source: string;
  /** Type-specific data; renderers must tolerate missing keys. */
  payload: Record<string, unknown>;
}

interface TimelineInput {
  lead: {
    source: string | null;
    createdAt: Date;
    contactedAt: Date | null;
    qualifiedAt: Date | null;
    convertedAt: Date | null;
  };
  opportunities: {
    id: string;
    name: string;
    status: string;
    amount: unknown;
    currency: string;
    createdAt: Date;
    closedAt: Date | null;
  }[];
  conversations: { id: string; channel: string; createdAt: Date }[];
  /** Compras/reembolsos del plano de datos (e-commerce, cualquier fuente). */
  purchaseEvents?: {
    /** 'purchase' | 'refund'. */
    type: string;
    /** Adaptador emisor: 'woocommerce'… */
    source: string;
    occurredAt: Date;
    props: Record<string, unknown>;
  }[];
}

export function buildLeadTimeline(input: TimelineInput): LeadTimelineEvent[] {
  const events: LeadTimelineEvent[] = [];
  const push = (type: string, date: Date | null, source: string, payload: Record<string, unknown> = {}) => {
    if (!date) return;
    events.push({ type, date: date.toISOString(), source, payload });
  };

  const { lead } = input;
  push('created', lead.createdAt, 'crm', { channel: lead.source });
  push('contacted', lead.contactedAt, 'crm');
  push('qualified', lead.qualifiedAt, 'crm');
  push('converted', lead.convertedAt, 'crm');

  for (const opp of input.opportunities) {
    const base = {
      opportunityId: opp.id,
      name: opp.name,
      amount: opp.amount == null ? null : String(opp.amount),
      currency: opp.currency,
    };
    push('opportunity', opp.createdAt, 'crm', { ...base, status: opp.status });
    // «Compras» = oportunidades ganadas (no purchase model exists in the system).
    if (opp.status === 'WON') push('purchase', opp.closedAt ?? opp.createdAt, 'crm', base);
  }

  for (const conv of input.conversations) {
    push('conversation', conv.createdAt, 'inbox', {
      conversationId: conv.id,
      channel: conv.channel,
    });
  }

  // Compras/reembolsos de e-commerce — conviven con las compras derivadas de
  // Oportunidades ganadas de arriba (distinto `source`, sin colisión).
  for (const ev of input.purchaseEvents ?? []) {
    push(ev.type, ev.occurredAt, ev.source, ev.props);
  }

  // Newest first — the UI shows the rail top-down.
  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
