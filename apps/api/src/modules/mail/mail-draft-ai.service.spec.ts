import { describe, it, expect, vi } from 'vitest';
import { MailDraftAiService } from './mail-draft-ai.service.js';

const actor = { userId: 'u1', role: 'OWNER' };

function makeService(over: { toolResult?: unknown; completeResult?: string; tx?: Record<string, unknown> } = {}) {
  const tx = over.tx ?? {
    emailThread: { findUnique: vi.fn().mockResolvedValue({ id: 't1', connectionId: 'c1', subject: 'Pedido', participants: ['cliente@x.com'] }) },
    emailMessage: {
      findMany: vi.fn().mockResolvedValue([
        { direction: 'IN', fromAddress: 'cliente@x.com', fromName: 'Cliente', text: 'Necesitamos pago a 60 días', html: null, detectedLang: 'es', sentAt: null, receivedAt: new Date('2026-08-26T09:00:00Z'), createdAt: new Date('2026-08-26T09:00:00Z') },
      ]),
    },
    lead: { findFirst: vi.fn().mockResolvedValue({ id: 'l1', name: 'Ana', company: 'Acme', status: 'LEAD', score: 80, source: 'Correo' }) },
    client: { findFirst: vi.fn().mockResolvedValue(null) },
    opportunity: { findMany: vi.fn().mockResolvedValue([]) },
    note: { findMany: vi.fn().mockResolvedValue([]) },
    agent: { findFirst: vi.fn().mockResolvedValue({ config: { businessInfo: 'Vendemos licencias', faqs: 'P: ¿plazos? R: 30 días' } }) },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const usage = { input: [] as { system?: string; userPrompt?: string }[] };
  const ai = {
    callWithTool: vi.fn().mockImplementation((o: { system: string; userPrompt: string }) => {
      usage.input.push(o);
      return Promise.resolve({
        result: over.toolResult ?? {
          variants: [
            { label: 'Directa', body: '<p>Podemos hacer 30 días.</p>' },
            { label: 'Explicativa', body: '<p>Te cuento el detalle.</p>' },
          ],
          subject: 'Propuesta',
        },
        inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: 0, durationMs: 1, model: 'sonnet',
      });
    }),
    complete: vi.fn().mockImplementation((o: { system: string; userPrompt: string }) => {
      usage.input.push(o);
      return Promise.resolve({
        result: over.completeResult ?? '<p>Texto mejorado.</p>',
        inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: 0, durationMs: 1, model: 'sonnet',
      });
    }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
  };
  const connections = {
    assertAccess: vi.fn().mockResolvedValue({ signature: 'Equipo\nVentas', fromAddress: 'ventas@a.com' }),
  } as never;
  return { svc: new MailDraftAiService(prisma, ai as never, connections), ai, usage, tx };
}

describe('MailDraftAiService.draftReply — contexto del prompt', () => {
  it('mete la ficha del CRM, el hilo y el conocimiento de producto en el prompt', async () => {
    const { svc, usage } = makeService();
    await svc.draftReply('t', 't1', actor, { instruction: 'Dile que aceptamos a 30 días' });
    const { system, userPrompt } = usage.input[0]!;
    // Sin esto el asistente no se distingue de pegar el hilo en un chatbot.
    expect(userPrompt).toContain('Ana');
    expect(userPrompt).toContain('Acme');
    expect(userPrompt).toContain('pago a 60 días'); // el hilo
    expect(userPrompt).toContain('Dile que aceptamos a 30 días'); // la instrucción
    expect(system).toContain('Vendemos licencias'); // conocimiento del agente
    expect(system).toContain('PREGUNTAS FRECUENTES');
  });

  it('incluye siempre la regla de no inventar', async () => {
    const { svc, usage } = makeService();
    await svc.draftReply('t', 't1', actor, { instruction: 'algo' });
    expect(usage.input[0]!.system).toContain('NUNCA inventes');
  });

  it('responde en el idioma del contacto', async () => {
    const { svc, usage, tx } = makeService();
    (tx.emailMessage as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([
      { direction: 'IN', fromAddress: 'c@x.com', fromName: 'C', text: 'We need 60 days payment terms please', html: null, detectedLang: 'en', sentAt: null, receivedAt: new Date(), createdAt: new Date() },
    ]);
    await svc.draftReply('t', 't1', actor, { instruction: 'algo' });
    expect(usage.input[0]!.system).toContain('inglés');
  });

  it('no pide firma al modelo cuando el buzón ya tiene una', async () => {
    const { svc, usage } = makeService();
    await svc.draftReply('t', 't1', actor, { instruction: 'algo' });
    expect(usage.input[0]!.system).toContain('NO añadas firma');
  });

  it('rechaza una instrucción vacía sin gastar una llamada', async () => {
    const { svc, ai } = makeService();
    await expect(svc.draftReply('t', 't1', actor, { instruction: '   ' })).rejects.toThrow();
    expect(ai.callWithTool).not.toHaveBeenCalled();
  });

  it('funciona sin ficha en el CRM y sin agente publicado', async () => {
    const { svc, usage, tx } = makeService();
    (tx.lead as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);
    (tx.agent as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);
    const res = await svc.draftReply('t', 't1', actor, { instruction: 'algo' });
    expect(res.variants).toHaveLength(2);
    expect(usage.input[0]!.userPrompt).toContain('Sin ficha en el CRM');
  });
});

describe('MailDraftAiService — saneado de la salida', () => {
  it('quita el script inyectado en el borrador', async () => {
    const { svc } = makeService({
      toolResult: { variants: [{ label: 'X', body: '<p>Hola</p><script>alert(1)</script>' }] },
    });
    const res = await svc.draftReply('t', 't1', actor, { instruction: 'algo' });
    expect(res.variants[0]!.html).not.toContain('script');
    expect(res.variants[0]!.html).toContain('Hola');
  });

  it('quita el cercado ```html que el modelo añade a veces', async () => {
    const { svc } = makeService({
      toolResult: { variants: [{ label: 'X', body: '```html\n<p>Hola</p>\n```' }] },
    });
    const res = await svc.draftReply('t', 't1', actor, { instruction: 'algo' });
    expect(res.variants[0]!.html).not.toContain('```');
  });

  it('falla claro si el modelo no devuelve nada utilizable', async () => {
    const { svc } = makeService({ toolResult: { variants: [{ label: 'X', body: '<p>   </p>' }] } });
    await expect(svc.draftReply('t', 't1', actor, { instruction: 'algo' })).rejects.toThrow();
  });

  it('pone etiqueta por defecto cuando el modelo la omite', async () => {
    const { svc } = makeService({ toolResult: { variants: [{ label: '', body: '<p>Hola</p>' }] } });
    const res = await svc.draftReply('t', 't1', actor, { instruction: 'algo' });
    expect(res.variants[0]!.label).toBe('Opción 1');
  });

  it('tope de 2 variantes aunque el modelo devuelva más', async () => {
    const { svc } = makeService({
      toolResult: {
        variants: [
          { label: 'a', body: '<p>1</p>' },
          { label: 'b', body: '<p>2</p>' },
          { label: 'c', body: '<p>3</p>' },
        ],
      },
    });
    const res = await svc.draftReply('t', 't1', actor, { instruction: 'algo' });
    expect(res.variants).toHaveLength(2);
  });
});

describe('MailDraftAiService.refine', () => {
  it('rechaza una acción desconocida', async () => {
    const { svc, ai } = makeService();
    await expect(svc.refine('t', actor, { html: '<p>hola</p>', action: 'inventada' })).rejects.toThrow();
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('rechaza texto vacío, incluso con etiquetas', async () => {
    const { svc, ai } = makeService();
    await expect(svc.refine('t', actor, { html: '<p><br></p>', action: 'mejorar' })).rejects.toThrow();
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('exige un idioma soportado al traducir', async () => {
    const { svc } = makeService();
    await expect(
      svc.refine('t', actor, { html: '<p>hola</p>', action: 'traducir', lang: 'klingon' }),
    ).rejects.toThrow();
  });

  it('sanea lo que devuelve el modelo', async () => {
    const { svc } = makeService({ completeResult: '<p>ok</p><img src=x onerror=alert(1)>' });
    const res = await svc.refine('t', actor, { html: '<p>hola</p>', action: 'mejorar' });
    expect(res.html).not.toContain('onerror');
  });
});

describe('MailDraftAiService — límite de uso', () => {
  it('corta al pasarse de llamadas por minuto en el mismo tenant', async () => {
    const { svc } = makeService();
    for (let i = 0; i < 20; i++) {
      await svc.refine('t', actor, { html: '<p>hola</p>', action: 'mejorar' });
    }
    await expect(svc.refine('t', actor, { html: '<p>hola</p>', action: 'mejorar' })).rejects.toThrow(
      /muchas veces/,
    );
  });

  it('el límite es por tenant, no global', async () => {
    const { svc } = makeService();
    for (let i = 0; i < 20; i++) {
      await svc.refine('tenant-a', actor, { html: '<p>hola</p>', action: 'mejorar' });
    }
    // Otro tenant no debe verse afectado.
    await expect(
      svc.refine('tenant-b', actor, { html: '<p>hola</p>', action: 'mejorar' }),
    ).resolves.toBeDefined();
  });
});
