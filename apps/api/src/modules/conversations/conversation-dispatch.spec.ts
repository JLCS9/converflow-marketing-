import { describe, it, expect, vi } from 'vitest';
import { ConversationIngestService } from './conversation-ingest.service.js';

/**
 * E1 · El dispatch unificado: replyMode manda ANTES de gastar, guard de
 * humano, fallback en dos fases sin doble respuesta y perfil multicanal.
 */
function makeService(over: {
  aiEngine?: string;
  replyMode?: string;
  assignedUserId?: string | null;
  humanOut?: { id: string } | null;
  respondFails?: boolean;
  deliverResult?: { delivered: boolean; reason?: string };
} = {}) {
  const tx = {
    conversation: {
      findUnique: vi.fn().mockResolvedValue({
        channel: 'WHATSAPP',
        assignedUserId: over.assignedUserId ?? null,
        bot: {
          id: 'b1',
          aiEngine: over.aiEngine ?? 'ENGINE',
          replyMode: over.replyMode ?? 'AUTO',
          agentId: 'a1',
        },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    message: {
      findFirst: vi.fn().mockResolvedValue(over.humanOut === undefined ? null : over.humanOut),
      findMany: vi.fn().mockResolvedValue([]),
    },
    agent: {
      findUnique: vi.fn().mockResolvedValue({
        config: { tone: 'cercano', language: 'español', tools: [], aiDisclosure: 'Soy un asistente.' },
      }),
    },
    lead: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const usage = {
    inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.001, durationMs: 100,
    model: 'claude-sonnet-4-6',
  };
  const engine = {
    respond: over.respondFails
      ? vi.fn().mockRejectedValue(new Error('cap de presupuesto'))
      : vi.fn().mockResolvedValue({
          reply: 'Respuesta del motor',
          canAnswer: true,
          extractedKeys: [],
          consentGranted: false,
          actions: [],
          sources: 2,
          usage,
        }),
    hasMemory: vi.fn().mockResolvedValue(true),
  };
  const delivery = {
    deliver: vi.fn().mockResolvedValue(over.deliverResult ?? { delivered: true, outMessageId: 'out1' }),
    suggest: vi.fn().mockResolvedValue(undefined),
  };
  const agentRuntime = { runForMessage: vi.fn().mockResolvedValue(undefined) };
  const ai = { recordUsage: vi.fn(), classifyNote: vi.fn().mockResolvedValue({ result: {} }) };
  const budget = {
    inboundAnalysisEnabled: vi.fn().mockResolvedValue(true),
    assertWithinBudget: vi.fn().mockResolvedValue(undefined),
  };
  const profiles = { resolveForEvent: vi.fn().mockResolvedValue({ id: 'p1' }) };
  const crmActions = { execute: vi.fn().mockResolvedValue('ok') };

  const svc = new ConversationIngestService(
    prisma,
    ai as never,
    agentRuntime as never,
    budget as never,
    engine as never,
    profiles as never,
    { enqueueBatch: vi.fn() } as never,
    delivery as never,
    crmActions as never,
  );
  // classifyMessage es pesado de mockear entero: lo espiamos directamente.
  const classifySpy = vi
    .spyOn(svc as never as { classifyMessage: () => Promise<void> }, 'classifyMessage')
    .mockResolvedValue(undefined);
  return { svc, engine, delivery, agentRuntime, profiles, classifySpy, tx };
}

const lead = {
  id: 'l1', name: 'Carlos', company: null, status: 'NEW', score: null,
  email: null, phone: '+34600111222', source: 'whatsapp',
};

function dispatch(svc: ConversationIngestService) {
  (svc as never as {
    dispatchInbound: (t: string, a: string | null, c: string, m: string, b: string, l: unknown) => void;
  }).dispatchInbound('t1', 'a1', 'c1', 'm1', 'Hola, ¿precio?', lead);
  // el dispatch es fire-and-forget: drenar la cola de microtareas
  return new Promise((r) => setTimeout(r, 10));
}

describe('dispatchInbound (E1)', () => {
  it('OFF → ni motor ni entrega: solo clasificación (cero gasto de generación)', async () => {
    const { svc, engine, delivery, classifySpy } = makeService({ replyMode: 'OFF' });
    await dispatch(svc);
    expect(engine.respond).not.toHaveBeenCalled();
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(classifySpy).toHaveBeenCalledOnce();
  });

  it('SUGGEST → genera y sugiere, jamás entrega', async () => {
    const { svc, engine, delivery } = makeService({ replyMode: 'SUGGEST' });
    await dispatch(svc);
    expect(engine.respond).toHaveBeenCalledOnce();
    expect(delivery.suggest).toHaveBeenCalledOnce();
    expect(delivery.deliver).not.toHaveBeenCalled();
  });

  it('AUTO → genera y entrega con dedupeKey del mensaje entrante', async () => {
    const { svc, delivery } = makeService();
    await dispatch(svc);
    expect(delivery.deliver.mock.calls[0]![0]).toMatchObject({ dedupeKey: 'ai:m1' });
  });

  it('guard humano: conversación asignada → AUTO degrada a sugerencia', async () => {
    const { svc, delivery } = makeService({ assignedUserId: 'u1' });
    await dispatch(svc);
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(delivery.suggest).toHaveBeenCalledOnce();
  });

  it('guard humano: OUT humano reciente → también degrada', async () => {
    const { svc, delivery } = makeService({ humanOut: { id: 'msg-humano' } });
    await dispatch(svc);
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(delivery.suggest).toHaveBeenCalledOnce();
  });

  it('fallback fase 1: el motor falla ANTES de generar → solo clasificar, nunca el legado', async () => {
    const { svc, delivery, agentRuntime, classifySpy } = makeService({ respondFails: true });
    await dispatch(svc);
    expect(agentRuntime.runForMessage).not.toHaveBeenCalled();
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(classifySpy).toHaveBeenCalledOnce();
  });

  it('fallback fase 2: la entrega falla con texto YA generado → sugerencia, sin re-generar', async () => {
    const { svc, engine, delivery } = makeService({
      deliverResult: { delivered: false, reason: 'transport_failed' },
    });
    await dispatch(svc);
    expect(engine.respond).toHaveBeenCalledOnce(); // una sola generación
    expect(delivery.suggest).toHaveBeenCalledOnce();
  });

  it('perfil multicanal: en WhatsApp resuelve por teléfono (sin email)', async () => {
    const { svc, profiles } = makeService();
    await dispatch(svc);
    expect(profiles.resolveForEvent.mock.calls[0]![1]).toMatchObject({ phone: '+34600111222' });
  });

  it('bot LEGACY → el camino antiguo intacto', async () => {
    const { svc, engine, agentRuntime } = makeService({ aiEngine: 'LEGACY' });
    await dispatch(svc);
    expect(engine.respond).not.toHaveBeenCalled();
    expect(agentRuntime.runForMessage).toHaveBeenCalledOnce();
  });
});
