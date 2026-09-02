import { describe, it, expect, vi } from 'vitest';
import { MailAutoReplyService, renderReplyHtml } from './mail-auto-reply.service.js';
import type { ParsedEmail } from './drivers/mail-driver.js';

/**
 * Atención autónoma · Guardas de la auto-respuesta de correo: nada de gasto
 * sin pasar TODAS; el envío solo en AUTO+canAnswer; degradaciones a borrador.
 */
function makeService(over: {
  aiReplyMode?: string;
  autoSubmitted?: boolean;
  from?: string;
  locked?: boolean;
  dedupeExisting?: boolean;
  outAfter?: boolean;
  aiCount24h?: number;
  assignee?: string | null;
  assigneeReplied?: boolean;
  canAnswer?: boolean;
  smtpFails?: boolean;
} = {}) {
  const inboundCreatedAt = new Date(Date.now() - 60_000);
  const tx = {
    mailConnection: {
      findUnique: vi.fn().mockResolvedValue({
        aiReplyMode: over.aiReplyMode ?? 'AUTO',
        signature: '<p>— Academia</p>',
        fromAddress: 'info@academia.com',
      }),
    },
    emailThread: {
      findUnique: vi.fn().mockResolvedValue({
        assigneeUserId: over.assignee ?? null,
        lockedByUserId: over.locked ? 'u9' : null,
        lockedAt: over.locked ? new Date() : null,
      }),
    },
    emailMessage: {
      findUnique: vi.fn().mockResolvedValue({
        createdAt: inboundCreatedAt,
        text: '¿Cuánto dura el curso?',
        subject: 'Duda',
        detectedLang: 'es',
      }),
      findFirst: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (where.dedupeKey) return Promise.resolve(over.dedupeExisting ? { id: 'dup' } : null);
        if (where.sentByUserId) return Promise.resolve(over.assigneeReplied ? { id: 'hout' } : null);
        return Promise.resolve(over.outAfter ? { id: 'out' } : null);
      }),
      count: vi.fn().mockResolvedValue(over.aiCount24h ?? 0),
      findMany: vi.fn().mockResolvedValue([{ direction: 'IN', text: 'hola' }]),
    },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const usage = {
    inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.001, durationMs: 100,
    model: 'claude-sonnet-4-6',
  };
  const engine = {
    respond: vi.fn().mockResolvedValue({
      reply: 'El curso dura seis semanas.',
      canAnswer: over.canAnswer ?? true,
      extractedKeys: [],
      consentGranted: false,
      actions: [],
      sources: 2,
      usage,
    }),
  };
  const compose = {
    replyAsAssistant: over.smtpFails
      ? vi.fn().mockRejectedValue(new Error('SMTP caído'))
      : vi.fn().mockResolvedValue({ ok: true }),
    saveAssistantDraft: vi.fn().mockResolvedValue({ draftId: 'd1' }),
  };
  const profiles = { resolveForEvent: vi.fn().mockResolvedValue({ id: 'p1' }) };
  const budget = {
    inboundAnalysisEnabled: vi.fn().mockResolvedValue(true),
    assertWithinBudget: vi.fn().mockResolvedValue(undefined),
  };
  const ai = { recordUsage: vi.fn() };

  // withTenant del helper CRM usa el mismo prisma mock: añadir tablas CRM
  Object.assign(tx, {
    lead: { findFirst: vi.fn().mockResolvedValue(null) },
    client: { findFirst: vi.fn().mockResolvedValue(null) },
    opportunity: { findMany: vi.fn().mockResolvedValue([]) },
    note: { findMany: vi.fn().mockResolvedValue([]) },
  });

  const svc = new MailAutoReplyService(
    prisma, ai as never, budget as never, engine as never, profiles as never, compose as never,
  );
  return { svc, engine, compose, ai };
}

const email = (over: Partial<ParsedEmail> = {}): ParsedEmail => ({
  to: ['info@academia.com'],
  cc: [],
  fromAddress: 'cliente@empresa.com',
  hasAttachments: false,
  ...over,
});

const call = (svc: MailAutoReplyService, e: ParsedEmail = email()) =>
  svc.maybeRespond('t1', { connectionId: 'conn1', threadId: 'th1', messageId: 'm1', email: e });

describe('MailAutoReplyService — guardas antes de gastar', () => {
  it('OFF → ni motor ni envío', async () => {
    const { svc, engine, compose } = makeService({ aiReplyMode: 'OFF' });
    await call(svc);
    expect(engine.respond).not.toHaveBeenCalled();
    expect(compose.replyAsAssistant).not.toHaveBeenCalled();
  });

  it('remitente automatizado (RFC 3834) → skip sin gastar', async () => {
    const { svc, engine } = makeService();
    await call(svc, email({ autoSubmitted: true }));
    expect(engine.respond).not.toHaveBeenCalled();
  });

  it('no-reply@ → skip; eco del propio buzón → skip', async () => {
    const a = makeService();
    await call(a.svc, email({ fromAddress: 'no-reply@banco.com' }));
    expect(a.engine.respond).not.toHaveBeenCalled();

    const b = makeService();
    await call(b.svc, email({ fromAddress: 'info@academia.com' }));
    expect(b.engine.respond).not.toHaveBeenCalled();
  });

  it('lock humano fresco → skip', async () => {
    const { svc, engine } = makeService({ locked: true });
    await call(svc);
    expect(engine.respond).not.toHaveBeenCalled();
  });

  it('idempotencia: dedupeKey ya existe u OUT posterior al IN → skip', async () => {
    const a = makeService({ dedupeExisting: true });
    await call(a.svc);
    expect(a.engine.respond).not.toHaveBeenCalled();

    const b = makeService({ outAfter: true });
    await call(b.svc);
    expect(b.engine.respond).not.toHaveBeenCalled();
  });

  it('cap anti-loop: 3 respuestas IA en el hilo/24h → skip', async () => {
    const { svc, engine } = makeService({ aiCount24h: 3 });
    await call(svc);
    expect(engine.respond).not.toHaveBeenCalled();
  });
});

describe('MailAutoReplyService — entrega por modo', () => {
  it('AUTO + canAnswer → envía como Asistente (PENDING, dedupeKey) y registra delivered', async () => {
    const { svc, compose, ai } = makeService();
    await call(svc);
    expect(compose.replyAsAssistant).toHaveBeenCalledWith('t1', 'th1', {
      html: expect.stringContaining('seis semanas'),
      dedupeKey: 'ai-reply:m1',
      markPending: true,
    });
    expect(compose.saveAssistantDraft).not.toHaveBeenCalled();
    const meta = ai.recordUsage.mock.calls[0]![0].metadata;
    expect(meta).toMatchObject({ channel: 'EMAIL', mode: 'AUTO', delivered: true });
  });

  it('SUGGEST → borrador, jamás envío', async () => {
    const { svc, compose } = makeService({ aiReplyMode: 'SUGGEST' });
    await call(svc);
    expect(compose.replyAsAssistant).not.toHaveBeenCalled();
    expect(compose.saveAssistantDraft).toHaveBeenCalledOnce();
  });

  it('canAnswer=false → NUNCA envía aunque esté en AUTO: borrador (la laguna la registró el motor)', async () => {
    const { svc, compose } = makeService({ canAnswer: false });
    await call(svc);
    expect(compose.replyAsAssistant).not.toHaveBeenCalled();
    expect(compose.saveAssistantDraft).toHaveBeenCalledOnce();
  });

  it('guard humano: asignado que respondió en 24h → degrada a borrador', async () => {
    const { svc, compose } = makeService({ assignee: 'u1', assigneeReplied: true });
    await call(svc);
    expect(compose.replyAsAssistant).not.toHaveBeenCalled();
    expect(compose.saveAssistantDraft).toHaveBeenCalledOnce();
  });

  it('asignado SIN respuesta reciente NO degrada (el enrutado asigna todo)', async () => {
    const { svc, compose } = makeService({ assignee: 'u1', assigneeReplied: false });
    await call(svc);
    expect(compose.replyAsAssistant).toHaveBeenCalledOnce();
  });

  it('SMTP falla tras generar → borrador con el MISMO texto, una sola llamada al motor', async () => {
    const { svc, engine, compose } = makeService({ smtpFails: true });
    await call(svc);
    expect(engine.respond).toHaveBeenCalledTimes(1);
    expect(compose.saveAssistantDraft).toHaveBeenCalledWith('t1', 'th1', {
      html: expect.stringContaining('seis semanas'),
    });
  });
});

describe('renderReplyHtml', () => {
  it('párrafos escapados + firma del buzón', () => {
    const html = renderReplyHtml('Hola <cliente>.\n\nSegundo párrafo.', '<p>— Firma</p>');
    expect(html).toBe('<p>Hola &lt;cliente&gt;.</p><p>Segundo párrafo.</p><p>— Firma</p>');
  });
});
