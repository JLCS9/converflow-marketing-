import { describe, it, expect, vi } from 'vitest';
import { ConversationEngineService } from './conversation-engine.service.js';
import { buildEngineSystem } from './context.js';

/**
 * Motor conversacional (F2): una llamada produce respuesta + extracción +
 * laguna + consentimiento, y cada pieza cierra su bucle.
 */
function makeService(toolOutput: Record<string, unknown>, over: { defs?: unknown[] } = {}) {
  const profileUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    tenantInstruction: { count: vi.fn().mockResolvedValue(1) },
    ragChunk: { count: vi.fn().mockResolvedValue(3) },
    customFieldDefinition: {
      findMany: vi.fn().mockResolvedValue(
        over.defs ?? [
          { key: 'curso_objetivo', label: 'Curso', type: 'TEXT', extractable: true },
          {
            key: 'rol_compra', label: 'Rol', type: 'SELECT', extractable: true,
            options: [{ value: 'alumno', label: 'Alumno' }, { value: 'empresa', label: 'Empresa' }],
          },
        ],
      ),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue({ name: 'Ana', lifecycleState: 'interesado', custom: {} }),
      update: profileUpdate,
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
    bypass: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({ tenant: { findUnique: vi.fn().mockResolvedValue({ name: 'Academia X' }) } })),
  } as never;
  const callWithTool = vi.fn().mockResolvedValue({
    result: toolOutput,
    inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.001, durationMs: 500,
    model: 'claude-sonnet-4-6',
  });
  const ai = { callWithTool, modelFor: () => 'claude-sonnet-4-6', recordUsage: vi.fn() };
  const knowledge = {
    listInstructions: vi.fn().mockResolvedValue([{ content: 'Nunca prometas plazas.' }]),
    retrieve: vi.fn().mockResolvedValue([
      { kind: 'verified', content: 'P: ¿Duración?\nR: Seis semanas.', meta: {}, distance: 0.2 },
      { kind: 'knowledge', content: 'Los cursos duran seis semanas.', meta: {}, distance: 0.3 },
    ]),
    recordGap: vi.fn().mockResolvedValue({ id: 'gap1', grouped: false }),
  };
  const consents = { grant: vi.fn().mockResolvedValue({}) };
  const profiles = { resolveForEvent: vi.fn().mockResolvedValue({ id: 'p1' }) };
  const customFields = { validateValues: vi.fn().mockImplementation((_t, _e, v) => Promise.resolve(v)) };
  const svc = new ConversationEngineService(
    prisma, ai as never, knowledge as never, consents as never, profiles as never, customFields as never,
  );
  return { svc, callWithTool, ai, knowledge, consents, customFields, profileUpdate };
}

const base = { channel: 'WEBCHAT', text: '¿Cuánto dura el curso?', history: [], profileId: 'p1' };

describe('ConversationEngineService.respond', () => {
  it('responde con FUENTES en el system y registra el uso', async () => {
    const { svc, callWithTool, ai } = makeService({ reply: 'Seis semanas.', can_answer: true });
    const res = await svc.respond('t1', base);
    expect(res.reply).toBe('Seis semanas.');
    expect(res.canAnswer).toBe(true);
    const args = callWithTool.mock.calls[0]![0];
    expect(args.system).toContain('[VERIFICADA]');
    expect(args.system).toContain('Nunca prometas plazas.');
    expect(args.tenantId).toBe('t1');
    expect(ai.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'conversation_engine' }),
    );
  });

  it('extracción válida se persiste en el perfil; claves inventadas no', async () => {
    const { svc, profileUpdate, customFields } = makeService({
      reply: 'Apuntado.',
      can_answer: true,
      extracted: { curso_objetivo: 'Liderazgo I', rol_compra: 'marciano', inventada: 'x' },
    });
    const res = await svc.respond('t1', base);
    expect(res.extractedKeys).toEqual(['curso_objetivo']);
    expect(customFields.validateValues).toHaveBeenCalledWith('t1', 'PROFILE', { curso_objetivo: 'Liderazgo I' }, { partial: true });
    expect(profileUpdate).toHaveBeenCalled();
  });

  it('cuando no sabe: registra laguna prioritaria (lead esperando)', async () => {
    const { svc, knowledge } = makeService({ reply: '¿Te contactamos?', can_answer: false });
    const res = await svc.respond('t1', { ...base, leadWaiting: true });
    expect(res.canAnswer).toBe(false);
    expect(res.gapId).toBe('gap1');
    expect(knowledge.recordGap).toHaveBeenCalledWith('t1', base.text, { hasWaitingLead: true });
  });

  it('aceptación de contacto → consentimiento con la frase literal como evidencia', async () => {
    const { svc, consents } = makeService({
      reply: 'Te llamamos.',
      can_answer: false,
      wants_contact: { accepted: true, channel: 'phone', value: '600 111 222' },
    });
    const res = await svc.respond('t1', { ...base, text: 'Sí, llamadme al 600 111 222' });
    expect(res.consentGranted).toBe(true);
    const [, , channel, purpose, evidence] = consents.grant.mock.calls[0]!;
    expect(channel).toBe('phone');
    expect(purpose).toBe('followup');
    expect(evidence.textShown).toBe('Sí, llamadme al 600 111 222');
  });
});

describe('buildEngineSystem', () => {
  it('sin fuentes lo dice explícitamente y ordena no inventar', () => {
    const sys = buildEngineSystem({
      tenantName: 'X', instructions: [], blocks: [], profile: null,
      channel: 'WEBCHAT', extractableCount: 0,
    });
    expect(sys).toContain('FUENTES: (vacío');
    expect(sys).toContain('Jamás inventes');
  });

  it('los datos ya conocidos del perfil viajan con orden de no repreguntar', () => {
    const sys = buildEngineSystem({
      tenantName: 'X', instructions: [], blocks: [],
      profile: { name: 'Ana', lifecycleState: 'alumno', custom: { curso_objetivo: 'Liderazgo' } },
      channel: 'WEBCHAT', extractableCount: 3,
    });
    expect(sys).toContain('curso_objetivo');
    expect(sys).toContain('no vuelvas a preguntarlos');
  });
});
