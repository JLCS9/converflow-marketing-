import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError, BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { htmlToText } from '../../common/utils/email-html.js';
import { resolveLocale } from '@converflow/shared';
import { env } from '../../config/env.js';
import { MailConnectionsService } from './mail-connections.service.js';

interface Actor {
  userId: string;
  role: string;
}

/** Where the ball is, from our side of the mailbox. */
export const THREAD_STATES = ['WAITING_US', 'WAITING_THEM', 'BLOCKED', 'CLOSED'] as const;
export type ThreadState = (typeof THREAD_STATES)[number];

export interface ThreadSummary {
  bullets: string[];
  /** Explicit asks directed at us. Empty when there are none. */
  asks: string[];
  nextStep: string;
  state: ThreadState;
}

/** Languages we offer translation into, keyed by ISO-639-1. */
export const SUPPORTED_LANGS: Record<string, string> = {
  es: 'español',
  en: 'inglés',
  fr: 'francés',
  de: 'alemán',
  pt: 'portugués',
  it: 'italiano',
  ca: 'catalán',
  gl: 'gallego',
  eu: 'euskera',
  nl: 'neerlandés',
};

/** Cap what we feed the model: a long thread would blow up cost for no gain. */
const MAX_MESSAGES_IN_PROMPT = 12;
const MAX_CHARS_PER_MESSAGE = 1500;
const MAX_TRANSLATE_CHARS = 8000;

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    bullets: {
      type: 'array',
      items: { type: 'string' },
      description: '3 a 5 viñetas con lo que ha pasado en el hilo, en orden cronológico.',
    },
    asks: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Peticiones concretas dirigidas a NOSOTROS que siguen sin resolver. Lista vacía si no hay ninguna.',
    },
    nextStep: {
      type: 'string',
      description: 'Una frase con la siguiente acción concreta que deberíamos hacer.',
    },
    state: {
      type: 'string',
      enum: [...THREAD_STATES],
      description:
        'WAITING_US = nos toca contestar. WAITING_THEM = hemos contestado y esperamos. BLOCKED = hace falta algo de un tercero. CLOSED = el asunto está resuelto.',
    },
  },
  required: ['bullets', 'asks', 'nextStep', 'state'],
} as const;

/**
 * Reading aids over an email thread: a cached summary and cached per-message
 * translation.
 *
 * Both are cached in the database, and that is a design requirement rather than
 * an optimisation: the inbox re-fetches the open thread every 12 seconds, so a
 * summary computed on read would bill a Claude call on every poll tick.
 */
@Injectable()
export class MailAiService {
  private readonly logger = new Logger(MailAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly connections: MailConnectionsService,
  ) {}

  /**
   * Summary of a thread. Returns the cached one untouched unless the thread has
   * grown since; `force` re-summarizes regardless (the "regenerar" button).
   */
  async summarize(
    tenantId: string,
    threadId: string,
    actor: Actor,
    opts: { force?: boolean; locale?: string } = {},
  ): Promise<{ summary: ThreadSummary; cached: boolean; at: Date }> {
    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: threadId } }),
    );
    if (!thread) throw new NotFoundError('Hilo no encontrado');
    await this.connections.assertAccess(tenantId, thread.connectionId, actor);

    const messages = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findMany({
        where: { threadId, isDraft: false },
        orderBy: { createdAt: 'asc' },
        select: {
          direction: true,
          fromAddress: true,
          fromName: true,
          subject: true,
          text: true,
          html: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
        },
      }),
    );
    if (!messages.length) throw new BadRequestError('El hilo no tiene mensajes que resumir');

    // La caché guarda el idioma con el que se generó: sin eso, un usuario
    // francés recibiría el resumen que ya había hecho un compañero en español.
    const cachedLocale = (thread.aiSummary as { _locale?: string } | null)?._locale;
    const wantLocale = resolveLocale(opts.locale);
    const fresh =
      !opts.force &&
      thread.aiSummary != null &&
      thread.aiSummaryMsgCount === messages.length &&
      cachedLocale === wantLocale;
    if (fresh) {
      return {
        summary: thread.aiSummary as unknown as ThreadSummary,
        cached: true,
        at: thread.aiSummaryAt ?? new Date(),
      };
    }

    // AI call OUTSIDE any transaction — withTenant opens an interactive
    // transaction with a 5s timeout and Claude takes longer than that.
    const call = await this.ai.callWithTool<ThreadSummary>({
      model: env.ANTHROPIC_FAST_MODEL,
      system:
        'Eres un asistente que resume hilos de correo de un equipo comercial. ' +
        'Resume SOLO lo que aparece en el hilo: no inventes datos, cifras, fechas ni compromisos. ' +
        'Si algo no está claro en el texto, no lo afirmes. Directo y sin relleno. ' +
        // El resumen lo lee el usuario, así que va en SU idioma, no en el del
        // hilo: un usuario francés no quiere un resumen en español de un correo
        // en inglés.
        `Escribe el resumen en ${SUPPORTED_LANGS[resolveLocale(opts.locale)] ?? 'español'}.`,
      userPrompt: this.buildSummaryPrompt(thread.subject, messages),
      toolName: 'resumir_hilo',
      toolDescription: 'Devuelve el resumen estructurado del hilo de correo.',
      toolInputSchema: SUMMARY_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 700,
    });

    const summary = this.normalizeSummary(call.result);
    const at = new Date();
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.update({
        where: { id: threadId },
        data: {
          aiSummary: { ...summary, _locale: wantLocale } as unknown as object,
          aiSummaryAt: at,
          aiSummaryMsgCount: messages.length,
        },
      }),
    );
    void this.ai.recordUsage({
      tenantId,
      feature: 'mail_summary',
      callResult: call,
      resourceType: 'email_thread',
      resourceId: threadId,
    });

    return { summary, cached: false, at };
  }

  /**
   * Translate one message into `lang`, from cache when we already did it.
   * Returns `null` when the message is already in the target language — the UI
   * uses that to keep the button hidden.
   */
  async translate(
    tenantId: string,
    messageId: string,
    actor: Actor,
    langRaw: string,
  ): Promise<{ lang: string; text: string; cached: boolean; sameLanguage: boolean }> {
    const lang = (langRaw ?? '').trim().toLowerCase().slice(0, 5);
    if (!SUPPORTED_LANGS[lang]) throw new BadRequestError('Idioma no soportado');

    const msg = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findUnique({ where: { id: messageId } }),
    );
    if (!msg) throw new NotFoundError('Mensaje no encontrado');
    await this.connections.assertAccess(tenantId, msg.connectionId, actor);

    const source = this.plainBody(msg).slice(0, MAX_TRANSLATE_CHARS);
    if (!source.trim()) throw new BadRequestError('El mensaje no tiene texto que traducir');

    if (msg.detectedLang && msg.detectedLang === lang) {
      return { lang, text: source, cached: true, sameLanguage: true };
    }

    const hit = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessageTranslation.findUnique({
        where: { messageId_lang: { messageId, lang } },
        select: { text: true },
      }),
    );
    if (hit) return { lang, text: hit.text, cached: true, sameLanguage: false };

    const call = await this.ai.complete({
      model: env.ANTHROPIC_FAST_MODEL,
      system:
        `Traduces correos al ${SUPPORTED_LANGS[lang]}. Devuelve ÚNICAMENTE la traducción, ` +
        'sin preámbulos ni comentarios. Conserva los saltos de línea, los nombres propios, ' +
        'las cifras y las direcciones de correo tal cual. Si el texto ya está en el idioma ' +
        'destino, devuélvelo sin cambios.',
      userPrompt: source,
      maxTokens: 2000,
    });
    const text = call.result.trim();

    await this.prisma
      .withTenant(tenantId, (tx) =>
        tx.emailMessageTranslation.create({
          data: { tenantId, messageId, lang, text, model: call.model },
        }),
      )
      // A concurrent request may have written the same row first; the cached
      // value is just as good, so never fail the response over it.
      .catch(() => undefined);

    void this.ai.recordUsage({
      tenantId,
      feature: 'mail_translate',
      callResult: call,
      resourceType: 'email_message',
      resourceId: messageId,
      metadata: { lang },
    });

    return { lang, text, cached: false, sameLanguage: false };
  }

  // ---- internals ----------------------------------------------------------

  private plainBody(msg: { text?: string | null; html?: string | null }): string {
    const t = (msg.text ?? '').trim();
    if (t) return t;
    return htmlToText(msg.html ?? '').trim();
  }

  private buildSummaryPrompt(
    subject: string | null,
    messages: {
      direction: string;
      fromAddress: string | null;
      fromName: string | null;
      text: string | null;
      html: string | null;
      sentAt: Date | null;
      receivedAt: Date | null;
      createdAt: Date;
    }[],
  ): string {
    // Keep the first message (it frames the conversation) plus the most recent
    // ones, which is what a long thread actually turns on.
    const kept =
      messages.length <= MAX_MESSAGES_IN_PROMPT
        ? messages
        : [messages[0]!, ...messages.slice(messages.length - (MAX_MESSAGES_IN_PROMPT - 1))];
    const omitted = messages.length - kept.length;

    const lines = kept.map((m) => {
      const when = (m.sentAt ?? m.receivedAt ?? m.createdAt).toISOString().slice(0, 16).replace('T', ' ');
      const who =
        m.direction === 'OUT'
          ? 'NOSOTROS'
          : `CONTACTO (${m.fromName || m.fromAddress || 'desconocido'})`;
      const body = this.plainBody(m).replace(/\s+\n/g, '\n').slice(0, MAX_CHARS_PER_MESSAGE);
      return `--- ${when} · ${who} ---\n${body}`;
    });

    return [
      `Asunto: ${subject ?? '(sin asunto)'}`,
      omitted > 0 ? `[se omiten ${omitted} mensajes intermedios]` : null,
      '',
      lines.join('\n\n'),
    ]
      .filter((x) => x !== null)
      .join('\n');
  }

  /** Defend against a model that returns too many/empty bullets. */
  private normalizeSummary(raw: ThreadSummary): ThreadSummary {
    const clean = (arr: unknown): string[] =>
      (Array.isArray(arr) ? arr : [])
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .slice(0, 5);
    const state = (THREAD_STATES as readonly string[]).includes(raw?.state)
      ? raw.state
      : 'WAITING_US';
    return {
      bullets: clean(raw?.bullets),
      asks: clean(raw?.asks),
      nextStep: String(raw?.nextStep ?? '').trim(),
      state,
    };
  }
}

/**
 * Spanish function words. Deliberately includes the very short ones: business
 * email in Spanish is often terse ("Perfecto, entonces lo dejamos en 40
 * licencias y pago a 30 días") and contains none of the longer, more
 * "conversational" markers. An earlier version scored only long words and
 * detected 2 of 5 real messages, so the Traducir button showed up on Spanish
 * mail — precisely the noise the feature exists to avoid.
 */
const ES_STOPWORDS = new Set([
  'de', 'la', 'el', 'en', 'y', 'a', 'que', 'los', 'las', 'un', 'una', 'por', 'con', 'para',
  'se', 'su', 'sus', 'no', 'es', 'al', 'lo', 'como', 'más', 'pero', 'le', 'ya', 'o', 'este',
  'esta', 'esto', 'estos', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta',
  'hay', 'desde', 'todo', 'todos', 'nos', 'ni', 'ese', 'eso', 'ante', 'antes', 'nada', 'ser',
  'son', 'está', 'están', 'tiene', 'tienen', 'puede', 'pueden', 'hacer', 'somos', 'estamos',
  'nuestro', 'nuestra', 'vuestro', 'vuestra', 'gracias', 'saludos', 'entonces', 'días', 'día',
  'así', 'sí', 'según', 'después', 'porque', 'del',
]);

/** Words that mean it is Portuguese/Italian rather than Spanish, despite the overlap. */
const NOT_ES_MARKERS = /(ção|ções|não|você|obrigado|saudações|estão|então|perché|grazie|sono|della|degli)/i;

/** Ratio of Spanish stopwords above which we call it Spanish. */
const ES_RATIO = 0.12;

/**
 * Stopwords for the other languages, used only once Spanish has been ruled out.
 */
const LANG_HINTS: Record<string, string[]> = {
  en: ['the', 'and', 'you', 'for', 'with', 'thanks', 'regards', 'please', 'from', 'have', 'we', 'is'],
  fr: ['les', 'des', 'vous', 'pour', 'avec', 'merci', 'bonjour', 'cordialement', 'nous', 'est', 'une'],
  de: ['und', 'die', 'der', 'mit', 'für', 'danke', 'sehr', 'grüße', 'nicht', 'wir', 'ist', 'den'],
  pt: ['obrigado', 'saudações', 'você', 'não', 'estão', 'então', 'uma', 'nós', 'para', 'com'],
  it: ['che', 'per', 'con', 'grazie', 'saluti', 'della', 'sono', 'non', 'una', 'perché'],
  nl: ['het', 'een', 'voor', 'met', 'bedankt', 'groeten', 'niet', 'wij', 'dank', 'van'],
};

/**
 * Guess the language of a message body, for the sole purpose of deciding whether
 * to offer a translation.
 *
 * Spanish first, and by ratio rather than by hit count: the app's readers are
 * Spanish speakers, so the expensive mistake is failing to recognise Spanish
 * (button shown where it is useless), not mislabelling a rare language.
 *
 * Conservative elsewhere: returns null on short text or a tie, and the caller
 * then simply offers translation rather than asserting a wrong language.
 */
export function guessLanguage(text: string): string | null {
  const words = (text.toLowerCase().match(/[\p{L}áéíóúüñç]+/gu) ?? []).filter((w) => w.length > 0);
  if (words.length < 6) return null;

  if (!NOT_ES_MARKERS.test(text)) {
    const hits = words.reduce((n, w) => n + (ES_STOPWORDS.has(w) ? 1 : 0), 0);
    if (hits / words.length >= ES_RATIO) return 'es';
  }

  const sample = new Set(words.slice(0, 400));
  const scores = Object.entries(LANG_HINTS).map(([lang, hints]) => ({
    lang,
    score: hints.reduce((n, h) => n + (sample.has(h) ? 1 : 0), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score < 2) return null;
  if (second && best.score === second.score) return null; // tie → don't guess
  return best.lang;
}
