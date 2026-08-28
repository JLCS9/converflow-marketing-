import { describe, it, expect, vi } from 'vitest';
import { MailAiService, guessLanguage } from './mail-ai.service.js';

const actor = { userId: 'u1', role: 'OWNER' };

function makeService(tx: Record<string, unknown>, aiOver: Record<string, unknown> = {}) {
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const ai = {
    callWithTool: vi.fn().mockResolvedValue({
      result: { bullets: ['a', 'b'], asks: [], nextStep: 'Contestar', state: 'WAITING_US' },
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsd: 0,
      durationMs: 1,
      model: 'haiku',
    }),
    complete: vi.fn().mockResolvedValue({
      result: 'Hola, buenos días',
      inputTokens: 5,
      outputTokens: 5,
      totalTokens: 10,
      costUsd: 0,
      durationMs: 1,
      model: 'haiku',
    }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    ...aiOver,
  };
  const connections = { assertAccess: vi.fn().mockResolvedValue({}) } as never;
  return { svc: new MailAiService(prisma, ai as never, connections), ai };
}

/** tx for summarize(): a thread plus N non-draft messages. */
function summaryTx(
  thread: Record<string, unknown>,
  messageCount = 2,
) {
  const update = vi.fn().mockResolvedValue({});
  return {
    tx: {
      emailThread: { findUnique: vi.fn().mockResolvedValue(thread), update },
      emailMessage: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: messageCount }, (_, i) => ({
            direction: i % 2 ? 'OUT' : 'IN',
            fromAddress: 'cliente@x.com',
            fromName: 'Cliente',
            subject: 'Pedido',
            text: `mensaje ${i}`,
            html: null,
            sentAt: null,
            receivedAt: new Date('2026-08-26T09:00:00Z'),
            createdAt: new Date('2026-08-26T09:00:00Z'),
          })),
        ),
      },
    },
    update,
  };
}

describe('MailAiService.summarize — caché', () => {
  const base = { id: 't1', connectionId: 'c1', subject: 'Pedido' };

  it('no llama al modelo si el resumen en caché cubre todos los mensajes', async () => {
    const { tx } = summaryTx(
      {
        ...base,
        // `_locale` forma parte del contrato de la caché: identifica en qué
        // idioma se generó el resumen guardado.
        aiSummary: { bullets: ['x'], asks: [], nextStep: 'y', state: 'CLOSED', _locale: 'es' },
        aiSummaryMsgCount: 2,
        aiSummaryAt: new Date('2026-08-26T10:00:00Z'),
      },
      2,
    );
    const { svc, ai } = makeService(tx);
    const res = await svc.summarize('t', 't1', actor);
    expect(res.cached).toBe(true);
    expect(res.summary.state).toBe('CLOSED');
    expect(ai.callWithTool).not.toHaveBeenCalled();
  });

  it('NO reutiliza el resumen en castellano para un usuario en francés', async () => {
    // Sin esta comprobación, el primero que resume un hilo fija el idioma para
    // todo el equipo: un compañero francés recibiría el resumen en castellano.
    const { tx } = summaryTx(
      {
        ...base,
        aiSummary: { bullets: ['x'], asks: [], nextStep: 'y', state: 'CLOSED', _locale: 'es' },
        aiSummaryMsgCount: 2,
      },
      2,
    );
    const { svc, ai } = makeService(tx);
    const res = await svc.summarize('t', 't1', actor, { locale: 'fr' });
    expect(res.cached).toBe(false);
    expect(ai.callWithTool).toHaveBeenCalledOnce();
    expect(ai.callWithTool.mock.calls[0]![0].system).toMatch(/franc/i);
  });

  it('guarda el idioma junto al resumen para poder distinguirlo después', async () => {
    const { tx, update } = summaryTx({ ...base, aiSummary: null }, 2);
    const { svc } = makeService(tx);
    await svc.summarize('t', 't1', actor, { locale: 'en' });
    expect(update.mock.calls[0]![0].data.aiSummary).toMatchObject({ _locale: 'en' });
  });

  it('recalcula cuando ha entrado un mensaje nuevo desde el resumen', async () => {
    const { tx } = summaryTx(
      { ...base, aiSummary: { bullets: ['x'], asks: [], nextStep: 'y', state: 'CLOSED' }, aiSummaryMsgCount: 2 },
      3, // el hilo creció
    );
    const { svc, ai } = makeService(tx);
    const res = await svc.summarize('t', 't1', actor);
    expect(res.cached).toBe(false);
    expect(ai.callWithTool).toHaveBeenCalledOnce();
  });

  it('recalcula cuando se fuerza, aunque la caché esté al día', async () => {
    const { tx } = summaryTx(
      { ...base, aiSummary: { bullets: ['x'], asks: [], nextStep: 'y', state: 'CLOSED' }, aiSummaryMsgCount: 2 },
      2,
    );
    const { svc, ai } = makeService(tx);
    await svc.summarize('t', 't1', actor, { force: true });
    expect(ai.callWithTool).toHaveBeenCalledOnce();
  });

  it('persiste el resumen junto al recuento que lo hizo válido', async () => {
    const { tx, update } = summaryTx({ ...base, aiSummary: null, aiSummaryMsgCount: null }, 4);
    const { svc } = makeService(tx);
    await svc.summarize('t', 't1', actor);
    expect(update.mock.calls[0]![0].data.aiSummaryMsgCount).toBe(4);
  });

  it('rechaza un hilo sin mensajes en vez de gastar una llamada', async () => {
    const { tx } = summaryTx({ ...base, aiSummary: null }, 0);
    const { svc, ai } = makeService(tx);
    await expect(svc.summarize('t', 't1', actor)).rejects.toThrow();
    expect(ai.callWithTool).not.toHaveBeenCalled();
  });

  it('sanea una respuesta del modelo con estado inválido y viñetas de sobra', async () => {
    const { tx } = summaryTx({ ...base, aiSummary: null }, 2);
    const { svc } = makeService(tx, {
      callWithTool: vi.fn().mockResolvedValue({
        result: {
          bullets: ['a', '', '  ', 'b', 'c', 'd', 'e', 'f'],
          asks: null,
          nextStep: '  hacer algo  ',
          state: 'INVENTADO',
        },
        inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: 0, durationMs: 1, model: 'haiku',
      }),
    });
    const res = await svc.summarize('t', 't1', actor);
    expect(res.summary.bullets).toEqual(['a', 'b', 'c', 'd', 'e']); // vacías fuera, tope 5
    expect(res.summary.asks).toEqual([]);
    expect(res.summary.nextStep).toBe('hacer algo');
    expect(res.summary.state).toBe('WAITING_US'); // estado desconocido → por defecto
  });
});

describe('MailAiService.translate', () => {
  function translateTx(msg: Record<string, unknown>, cached: { text: string } | null = null) {
    const create = vi.fn().mockResolvedValue({});
    return {
      tx: {
        emailMessage: { findUnique: vi.fn().mockResolvedValue(msg) },
        emailMessageTranslation: { findUnique: vi.fn().mockResolvedValue(cached), create },
      },
      create,
    };
  }
  const msg = { id: 'm1', connectionId: 'c1', text: 'Hello, good morning', html: null, detectedLang: 'en' };

  it('sirve desde caché sin llamar al modelo', async () => {
    const { tx, create } = translateTx(msg, { text: 'Hola, buenos días' });
    const { svc, ai } = makeService(tx);
    const res = await svc.translate('t', 'm1', actor, 'es');
    expect(res).toMatchObject({ text: 'Hola, buenos días', cached: true });
    expect(ai.complete).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('traduce y guarda en caché la primera vez', async () => {
    const { tx, create } = translateTx(msg);
    const { svc, ai } = makeService(tx);
    const res = await svc.translate('t', 'm1', actor, 'es');
    expect(res.cached).toBe(false);
    expect(ai.complete).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0].data).toMatchObject({ messageId: 'm1', lang: 'es' });
  });

  it('no gasta una llamada si el mensaje ya está en el idioma destino', async () => {
    const { tx } = translateTx({ ...msg, detectedLang: 'es', text: 'Hola' });
    const { svc, ai } = makeService(tx);
    const res = await svc.translate('t', 'm1', actor, 'es');
    expect(res.sameLanguage).toBe(true);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('rechaza un idioma no soportado antes de tocar la base', async () => {
    const { tx } = translateTx(msg);
    const { svc } = makeService(tx);
    await expect(svc.translate('t', 'm1', actor, 'klingon')).rejects.toThrow();
  });

  it('rechaza un mensaje sin texto', async () => {
    const { tx } = translateTx({ ...msg, text: '   ', html: null });
    const { svc, ai } = makeService(tx);
    await expect(svc.translate('t', 'm1', actor, 'es')).rejects.toThrow();
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('devuelve la traducción aunque falle el guardado en caché (carrera)', async () => {
    const { tx } = translateTx(msg);
    tx.emailMessageTranslation.create = vi.fn().mockRejectedValue(new Error('unique violation'));
    const { svc } = makeService(tx);
    const res = await svc.translate('t', 'm1', actor, 'es');
    expect(res.text).toBe('Hola, buenos días');
  });
});

describe('guessLanguage', () => {
  /**
   * Los cinco cuerpos reales del hilo de prueba. La primera versión de la
   * heurística solo acertaba 2 de 5, así que el botón «Traducir» aparecía en
   * correos en español — el ruido exacto que la función existe para evitar.
   */
  const ESPANOL_REAL = [
    'Buenos días, nos interesa vuestra herramienta para el equipo comercial. Somos 40 personas. ¿Podéis enviarnos un presupuesto?',
    'Hola Ana, gracias por escribir. Te paso la propuesta para 40 licencias con el descuento por volumen aplicado.',
    'Una pregunta desde compras: ¿el pago puede ser a 30 días?',
    'Sí, sin problema: pago a 30 días desde la fecha de factura.',
    'Perfecto, entonces lo dejamos en 40 licencias y pago a 30 días. Mandadnos el contrato.',
  ];

  it.each(ESPANOL_REAL)('reconoce como español: %s', (texto) => {
    expect(guessLanguage(texto)).toBe('es');
  });

  it('reconoce inglés y francés', () => {
    expect(
      guessLanguage('Hello, thanks for the quote. Could you please confirm the prices with the discount you mentioned'),
    ).toBe('en');
    expect(
      guessLanguage('Bonjour, merci pour le devis. Pouvez-vous confirmer les prix avec la remise dont nous avons parlé'),
    ).toBe('fr');
  });

  it('no confunde portugués con español pese al solapamiento', () => {
    expect(
      guessLanguage('Bom dia, não recebemos a proposta. Você pode enviar de novo? Obrigado e saudações'),
    ).toBe('pt');
  });

  it('devuelve null en vez de adivinar cuando no hay señal', () => {
    expect(guessLanguage('ok')).toBeNull();
    expect(guessLanguage('')).toBeNull();
    expect(guessLanguage('12345 67890 !!!')).toBeNull();
    expect(guessLanguage('Lorem ipsum dolor sit amet consectetur adipiscing')).toBeNull();
  });
});
