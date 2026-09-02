import { describe, it, expect, vi } from 'vitest';
import { ConversationAiService } from './conversation-ai.service.js';

/**
 * F3 · Resumen cacheado + bucle corrección→verificada.
 */
function makeService(over: {
  conversation?: Record<string, unknown> | null;
  messages?: { direction: string; body: string; createdAt: Date }[];
  gap?: { id: string; question: string } | null;
  toolOutput?: Record<string, unknown>;
} = {}) {
  const convUpdate = vi.fn().mockResolvedValue({});
  const gapUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    conversation: {
      findUnique: vi.fn().mockResolvedValue(
        over.conversation === undefined
          ? { id: 'c1', channel: 'WEBCHAT', aiSummary: null, aiSummaryAt: null, aiSummaryMsgCount: null, handoffContext: null }
          : over.conversation,
      ),
      update: convUpdate,
    },
    message: {
      findMany: vi.fn().mockResolvedValue(
        over.messages ?? [
          { direction: 'IN', body: 'Hola, ¿precio?', createdAt: new Date() },
          { direction: 'OUT', body: 'Entre 390 y 690 EUR.', createdAt: new Date() },
        ],
      ),
    },
    knowledgeGap: {
      findFirst: vi.fn().mockResolvedValue(over.gap === undefined ? null : over.gap),
      update: gapUpdate,
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const callWithTool = vi.fn().mockResolvedValue({
    result:
      over.toolOutput ?? { bullets: ['Preguntó precio'], asks: [], nextStep: 'Nada pendiente' },
    inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.001, durationMs: 300,
    model: 'claude-haiku-4-5',
  });
  const ai = { callWithTool, modelFor: () => 'claude-haiku-4-5', recordUsage: vi.fn() };
  const knowledge = {
    addVerifiedAnswer: vi.fn().mockResolvedValue({ id: 'va1' }),
  };
  const svc = new ConversationAiService(prisma, ai as never, knowledge as never);
  return { svc, tx, callWithTool, knowledge, convUpdate, gapUpdate };
}

describe('ConversationAiService.summarize', () => {
  it('caché válida (mismo nº de mensajes y locale) → no llama a la IA', async () => {
    const { svc, callWithTool } = makeService({
      conversation: {
        id: 'c1', channel: 'WEBCHAT',
        aiSummary: { bullets: ['x'], asks: [], nextStep: 'y', _locale: 'es' },
        aiSummaryAt: new Date(), aiSummaryMsgCount: 2, handoffContext: null,
      },
    });
    const res = await svc.summarize('t1', 'c1', { locale: 'es' });
    expect(res.cached).toBe(true);
    expect(callWithTool).not.toHaveBeenCalled();
  });

  it('la conversación creció → regenera y persiste la caché con locale', async () => {
    const { svc, callWithTool, convUpdate } = makeService({
      conversation: {
        id: 'c1', channel: 'WEBCHAT',
        aiSummary: { bullets: ['x'], asks: [], nextStep: 'y', _locale: 'es' },
        aiSummaryAt: new Date(), aiSummaryMsgCount: 1, handoffContext: null,
      },
    });
    const res = await svc.summarize('t1', 'c1', { locale: 'es' });
    expect(res.cached).toBe(false);
    expect(callWithTool).toHaveBeenCalledOnce();
    const data = convUpdate.mock.calls[0]![0].data;
    expect(data.aiSummaryMsgCount).toBe(2);
    expect(data.aiSummary._locale).toBe('es');
  });

  it('otro locale invalida la caché aunque el conteo coincida', async () => {
    const { svc, callWithTool } = makeService({
      conversation: {
        id: 'c1', channel: 'WEBCHAT',
        aiSummary: { bullets: ['x'], asks: [], nextStep: 'y', _locale: 'es' },
        aiSummaryAt: new Date(), aiSummaryMsgCount: 2, handoffContext: null,
      },
    });
    const res = await svc.summarize('t1', 'c1', { locale: 'fr' });
    expect(res.cached).toBe(false);
    expect(callWithTool).toHaveBeenCalledOnce();
  });
});

describe('ConversationAiService.learnFromHumanReply', () => {
  it('sin laguna abierta → ni llamada a IA ni verificada', async () => {
    const { svc, callWithTool, knowledge } = makeService({ gap: null });
    const res = await svc.learnFromHumanReply('t1', 'c1', 'Sí, hay descuento del 15% para grupos.');
    expect(res.learned).toBe(false);
    expect(callWithTool).not.toHaveBeenCalled();
    expect(knowledge.addVerifiedAnswer).not.toHaveBeenCalled();
  });

  it('respuesta que cubre la laguna → verificada generalizada + laguna COVERED', async () => {
    const { svc, knowledge, gapUpdate } = makeService({
      gap: { id: 'g1', question: '¿Hay descuento para grupos de 25?' },
      toolOutput: {
        answers_gap: true,
        question_general: '¿Hay descuento para grupos grandes?',
        answer_general: 'Sí: 15% a partir de 20 personas, con factura consolidada.',
      },
    });
    const res = await svc.learnFromHumanReply('t1', 'c1', 'Sí Carlos, para tus 25 hay 15%.', 'ana@x.com');
    expect(res).toEqual({ learned: true, verifiedId: 'va1' });
    const arg = knowledge.addVerifiedAnswer.mock.calls[0]!;
    expect(arg[1].question).toBe('¿Hay descuento para grupos grandes?');
    expect(arg[1].verifiedBy).toBe('ana@x.com');
    expect(arg[1].meta.fromGap).toBe('g1');
    expect(gapUpdate).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { status: 'COVERED' } });
  });

  it('aplazamiento («te llamo luego») → no aprende', async () => {
    const { svc, knowledge, gapUpdate } = makeService({
      gap: { id: 'g1', question: '¿Hay descuento?' },
      toolOutput: { answers_gap: false },
    });
    const res = await svc.learnFromHumanReply('t1', 'c1', 'Ahora te llamo y lo vemos, ¿vale?');
    expect(res.learned).toBe(false);
    expect(knowledge.addVerifiedAnswer).not.toHaveBeenCalled();
    expect(gapUpdate).not.toHaveBeenCalled();
  });

  it('texto trivial (corto) → ni siquiera consulta la laguna', async () => {
    const { svc, tx } = makeService({ gap: { id: 'g1', question: 'q' } });
    const res = await svc.learnFromHumanReply('t1', 'c1', 'ok');
    expect(res.learned).toBe(false);
    expect((tx.knowledgeGap.findFirst as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
