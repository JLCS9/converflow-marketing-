import { describe, it, expect, vi } from 'vitest';
import { ConversationDeliveryService } from './conversation-delivery.service.js';

/**
 * E1 · Entrega compartida: rate-limit, disclosure en primer OUT externo,
 * idempotencia por dedupeKey y waMessageId persistido (dedupe del eco).
 */
function makeService(over: {
  channel?: string;
  priorOut?: number;
  outLastMinute?: number;
  existingDedupe?: { id: string } | null;
  sendFails?: boolean;
} = {}) {
  const msgCreate = vi.fn().mockResolvedValue({ id: 'out1' });
  const convUpdate = vi.fn().mockResolvedValue({});
  const msgUpdate = vi.fn().mockResolvedValue({});
  const counts: number[] = [];
  const tx = {
    conversation: {
      findUnique: vi.fn().mockResolvedValue({
        botId: 'b1',
        contactJid: '34600111222@s.whatsapp.net',
        channel: over.channel ?? 'WHATSAPP',
      }),
      update: convUpdate,
    },
    message: {
      findFirst: vi.fn().mockResolvedValue(over.existingDedupe === undefined ? null : over.existingDedupe),
      count: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        // primera cuenta con createdAt = rate-limit; sin createdAt = priorOut
        const isRate = Boolean((where as { createdAt?: unknown }).createdAt);
        counts.push(1);
        return Promise.resolve(isRate ? (over.outLastMinute ?? 0) : (over.priorOut ?? 0));
      }),
      create: msgCreate,
      update: msgUpdate,
    },
    bot: { findUnique: vi.fn().mockResolvedValue({ maxMessagesPerMinute: 2 }) },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const botRunner = {
    sendText: over.sendFails
      ? vi.fn().mockRejectedValue(new Error('bot desconectado'))
      : vi.fn().mockResolvedValue({ id: 'wamid.123' }),
  };
  const email = { replyToConversation: vi.fn().mockResolvedValue({ id: 'em1' }) };
  const svc = new ConversationDeliveryService(prisma, botRunner as never, email as never);
  return { svc, tx, botRunner, email, msgCreate, msgUpdate };
}

const base = { tenantId: 't1', conversationId: 'c1', text: 'Hola, seis semanas.', dedupeKey: 'ai:m1' };

describe('ConversationDeliveryService.deliver', () => {
  it('WhatsApp: envía, guarda waMessageId y dedupeKey en el OUT', async () => {
    const { svc, botRunner, msgCreate } = makeService();
    const res = await svc.deliver(base);
    expect(res.delivered).toBe(true);
    expect(botRunner.sendText).toHaveBeenCalledOnce();
    const data = msgCreate.mock.calls[0]![0].data;
    expect(data.waMessageId).toBe('wamid.123');
    expect(data.dedupeKey).toBe('ai:m1');
  });

  it('disclosure SOLO en el primer OUT de canal externo', async () => {
    const first = makeService({ priorOut: 0 });
    await first.svc.deliver(base);
    expect(first.botRunner.sendText.mock.calls[0]![2]).toMatch(/\n\nHola, seis semanas\.$/);

    const later = makeService({ priorOut: 3 });
    await later.svc.deliver(base);
    expect(later.botRunner.sendText.mock.calls[0]![2]).toBe('Hola, seis semanas.');
  });

  it('webchat: sin transporte y SIN disclosure (el widget lo muestra fijo)', async () => {
    const { svc, botRunner, email, msgCreate } = makeService({ channel: 'WEBCHAT', priorOut: 0 });
    const res = await svc.deliver(base);
    expect(res.delivered).toBe(true);
    expect(botRunner.sendText).not.toHaveBeenCalled();
    expect(email.replyToConversation).not.toHaveBeenCalled();
    expect(msgCreate.mock.calls[0]![0].data.body).toBe('Hola, seis semanas.');
  });

  it('idempotencia: dedupeKey ya entregada → no repite ni el transporte', async () => {
    const { svc, botRunner, msgCreate } = makeService({ existingDedupe: { id: 'prev' } });
    const res = await svc.deliver(base);
    expect(res).toMatchObject({ delivered: true, reason: 'duplicate', outMessageId: 'prev' });
    expect(botRunner.sendText).not.toHaveBeenCalled();
    expect(msgCreate).not.toHaveBeenCalled();
  });

  it('rate-limit por bot en WhatsApp → no envía', async () => {
    const { svc, botRunner } = makeService({ outLastMinute: 5 });
    const res = await svc.deliver(base);
    expect(res).toMatchObject({ delivered: false, reason: 'rate_limited' });
    expect(botRunner.sendText).not.toHaveBeenCalled();
  });

  it('transporte caído → delivered false y SIN fila OUT', async () => {
    const { svc, msgCreate } = makeService({ sendFails: true });
    const res = await svc.deliver(base);
    expect(res).toMatchObject({ delivered: false, reason: 'transport_failed' });
    expect(msgCreate).not.toHaveBeenCalled();
  });
});

describe('ConversationDeliveryService.suggest', () => {
  it('escribe la sugerencia en el mensaje entrante', async () => {
    const { svc, msgUpdate } = makeService();
    await svc.suggest({ tenantId: 't1', inboundMessageId: 'm1', reply: 'Propuesta' });
    expect(msgUpdate.mock.calls[0]![0]).toMatchObject({
      where: { id: 'm1' },
      data: { aiSuggestedReply: 'Propuesta' },
    });
  });
});
