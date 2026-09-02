import { describe, it, expect, vi } from 'vitest';
import { PlaybooksService } from './playbooks.service.js';

/**
 * F3 · Guardarraíles de playbooks: frecuencia, consentimiento, canal y
 * borrador-para-aprobar. Las supresiones SIEMPRE dejan rastro (reason).
 */
function makeService(over: {
  playbooks?: Record<string, unknown>[];
  recentRun?: { id: string } | null;
  consent?: boolean;
  conversation?: { id: string; leadId: string } | null;
  mode?: string;
  guardrails?: Record<string, unknown> | null;
  run?: Record<string, unknown> | null;
} = {}) {
  const runCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'run1', ...data }));
  const runUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    playbook: {
      findMany: vi.fn().mockResolvedValue(
        over.playbooks ?? [
          {
            id: 'pb1',
            name: 'Rescate dormidos',
            active: true,
            mode: over.mode ?? 'DRAFT_APPROVE',
            trigger: { on: 'transition', toState: 'dormido' },
            action: { kind: 'followup', instructions: 'Ofrece retomar el curso sin presión.' },
            guardrails: over.guardrails === undefined ? null : over.guardrails,
          },
        ],
      ),
    },
    playbookRun: {
      findFirst: vi.fn().mockResolvedValue(over.recentRun === undefined ? null : over.recentRun),
      findUnique: vi.fn().mockResolvedValue(
        over.run === undefined
          ? { id: 'run1', status: 'DRAFT', draftText: 'Hola, ¿retomamos?', conversationId: 'c1' }
          : over.run,
      ),
      create: runCreate,
      update: runUpdate,
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue({
        name: 'Ana', lifecycleState: 'dormido', custom: {}, enrichment: null,
        leads: [{ id: 'l1' }],
      }),
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(
        over.conversation === undefined ? { id: 'c1', leadId: 'l1' } : over.conversation,
      ),
    },
    message: { findMany: vi.fn().mockResolvedValue([{ direction: 'IN', body: 'Hola' }]) },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const callWithTool = vi.fn().mockResolvedValue({
    result: { message: 'Hola Ana, ¿te ayudo a retomar el curso?' },
    inputTokens: 50, outputTokens: 30, totalTokens: 80, costUsd: 0.001, durationMs: 200,
    model: 'claude-sonnet-4-6',
  });
  const ai = { callWithTool, modelFor: () => 'claude-sonnet-4-6', recordUsage: vi.fn() };
  const consents = { hasConsent: vi.fn().mockResolvedValue(over.consent ?? true) };
  const conversations = { sendText: vi.fn().mockResolvedValue({ ok: true }) };
  const lifecycle = { getActiveDefinition: vi.fn().mockResolvedValue(null) };
  const svc = new PlaybooksService(prisma, ai as never, consents as never, conversations as never, lifecycle as never);
  return { svc, tx, runCreate, runUpdate, callWithTool, consents, conversations };
}

describe('PlaybooksService.onTransition', () => {
  it('sin playbook que case → no pasa nada', async () => {
    const { svc, runCreate, callWithTool } = makeService();
    await svc.onTransition('t1', 'p1', 'residente');
    expect(runCreate).not.toHaveBeenCalled();
    expect(callWithTool).not.toHaveBeenCalled();
  });

  it('guardarraíl de frecuencia: acción reciente al mismo contacto → SUPPRESSED sin gasto', async () => {
    const { svc, runCreate, callWithTool } = makeService({ recentRun: { id: 'old' } });
    await svc.onTransition('t1', 'p1', 'dormido');
    expect(callWithTool).not.toHaveBeenCalled();
    expect(runCreate.mock.calls[0]![0].data).toMatchObject({ status: 'SUPPRESSED', reason: 'frequency_cap' });
  });

  it('guardarraíl de consentimiento: sin followup vigente → SUPPRESSED sin gasto', async () => {
    const { svc, runCreate, callWithTool } = makeService({ consent: false });
    await svc.onTransition('t1', 'p1', 'dormido');
    expect(callWithTool).not.toHaveBeenCalled();
    expect(runCreate.mock.calls[0]![0].data).toMatchObject({ status: 'SUPPRESSED', reason: 'no_consent' });
  });

  it('sin conversación abierta → SUPPRESSED no_channel', async () => {
    const { svc, runCreate } = makeService({ conversation: null });
    await svc.onTransition('t1', 'p1', 'dormido');
    expect(runCreate.mock.calls[0]![0].data).toMatchObject({ status: 'SUPPRESSED', reason: 'no_channel' });
  });

  it('modo DRAFT_APPROVE (el de nacimiento) → borrador, jamás envía', async () => {
    const { svc, runCreate, conversations } = makeService();
    await svc.onTransition('t1', 'p1', 'dormido');
    const data = runCreate.mock.calls[0]![0].data;
    expect(data.status).toBe('DRAFT');
    expect(data.draftText).toContain('retomar');
    expect(conversations.sendText).not.toHaveBeenCalled();
  });

  it('modo AUTO fuera de horario de silencio → envía directamente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00'));
    const { svc, runCreate, conversations } = makeService({ mode: 'AUTO' });
    await svc.onTransition('t1', 'p1', 'dormido');
    expect(runCreate.mock.calls[0]![0].data.status).toBe('APPROVED');
    expect(conversations.sendText).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('modo AUTO dentro del horario de silencio → degrada a borrador', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T23:30:00'));
    const { svc, runCreate, conversations } = makeService({ mode: 'AUTO' });
    await svc.onTransition('t1', 'p1', 'dormido');
    expect(runCreate.mock.calls[0]![0].data.status).toBe('DRAFT');
    expect(conversations.sendText).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('PlaybooksService.approve / reject', () => {
  it('aprobar con texto editado → envía el editado y marca SENT', async () => {
    const { svc, conversations, runUpdate } = makeService();
    const res = await svc.approve('t1', 'run1', {
      editedText: 'Hola Ana, ¿te va bien retomar esta semana?',
      reviewer: { userId: 'u1', email: 'ana@x.com' },
    });
    expect(res).toMatchObject({ ok: true, status: 'SENT' });
    expect(conversations.sendText.mock.calls[0]![2]).toContain('retomar esta semana');
    const sent = runUpdate.mock.calls.find((c) => c[0].data.status === 'SENT');
    expect(sent![0].data.sentText).toContain('retomar esta semana');
    expect(sent![0].data.reviewedBy).toBe('ana@x.com');
  });

  it('solo se aprueban borradores', async () => {
    const { svc } = makeService({ run: { id: 'run1', status: 'SENT', draftText: 'x', conversationId: 'c1' } });
    await expect(
      svc.approve('t1', 'run1', { reviewer: { userId: 'u1', email: 'a@x.com' } }),
    ).rejects.toThrow(/borradores/i);
  });

  it('rechazar deja REJECTED con el revisor', async () => {
    const { svc, runUpdate } = makeService({ run: { id: 'run1', status: 'DRAFT' } });
    await svc.reject('t1', 'run1', 'ana@x.com');
    expect(runUpdate.mock.calls[0]![0].data).toMatchObject({ status: 'REJECTED', reviewedBy: 'ana@x.com' });
  });
});
