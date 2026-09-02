import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError, BadRequestError, AppError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { htmlToText, sanitizeEmailHtml } from '../../common/utils/email-html.js';
import { env } from '../../config/env.js';
import { MailConnectionsService } from './mail-connections.service.js';
import { guessLanguage, SUPPORTED_LANGS } from './mail-ai.service.js';

interface Actor {
  userId: string;
  role: string;
}

export const TONES = ['neutral', 'formal', 'cercano'] as const;
export const LENGTHS = ['corto', 'medio', 'largo'] as const;
export const REFINE_ACTIONS = ['mejorar', 'acortar', 'formal', 'cercano', 'traducir'] as const;

export type Tone = (typeof TONES)[number];
export type Length = (typeof LENGTHS)[number];
export type RefineAction = (typeof REFINE_ACTIONS)[number];

const TONE_HINT: Record<Tone, string> = {
  neutral: 'Tono profesional y neutro.',
  formal: 'Tono formal: trato de usted, sin coloquialismos.',
  cercano: 'Tono cercano y cordial, tuteando, sin caer en informalidad excesiva.',
};

const LENGTH_HINT: Record<Length, string> = {
  corto: 'Muy breve: 2-3 frases, sin rodeos.',
  medio: 'Un párrafo o dos.',
  largo: 'Desarrollado, pero sin relleno: máximo cuatro párrafos.',
};

const REFINE_HINT: Record<Exclude<RefineAction, 'traducir'>, string> = {
  mejorar: 'Mejora la redacción: más claro y mejor estructurado, mismo contenido y longitud similar.',
  acortar: 'Acórtalo a la mitad conservando todo lo importante.',
  formal: 'Reescríbelo en tono formal, con trato de usted.',
  cercano: 'Reescríbelo en tono cercano y cordial, tuteando.',
};

/** Per-tenant cap on assistant calls. Drafting is the expensive path. */
const RATE_LIMIT_PER_MINUTE = 20;

/** Context caps — a huge thread would cost a lot and help nothing. */
const MAX_THREAD_MESSAGES = 8;
const MAX_CHARS_PER_MESSAGE = 1200;
const MAX_INSTRUCTION = 1000;
const MAX_REFINE_CHARS = 12000;

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      description: 'Dos redacciones alternativas del mismo correo, con enfoques distintos.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Etiqueta de 2-4 palabras que distinga esta versión.' },
          body: {
            type: 'string',
            description:
              'Cuerpo del correo en HTML simple: solo <p>, <br>, <strong>, <em>, <ul>, <li>, <a>. ' +
              'SIN firma y SIN línea de asunto.',
          },
        },
        required: ['label', 'body'],
      },
    },
    subject: {
      type: 'string',
      description: 'Asunto propuesto. Cadena vacía si es una respuesta a un hilo existente.',
    },
  },
  required: ['variants'],
} as const;

export interface DraftVariant {
  label: string;
  html: string;
}

/**
 * Writing assistant for the mailbox.
 *
 * What separates it from pasting the thread into a chatbot is the context: the
 * thread, the CRM record behind the contact (status, open opportunities, recent
 * notes) and the tenant's own product knowledge from their published agent, all
 * under a hard "do not invent" rule.
 *
 * It NEVER sends. Every result lands in the composer for the user to review.
 */
@Injectable()
export class MailDraftAiService {
  private readonly logger = new Logger(MailDraftAiService.name);
  /** tenantId → recent call timestamps. In-process, like the other schedulers. */
  private readonly recentCalls = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly connections: MailConnectionsService,
  ) {}

  /** Draft a reply to an existing thread. */
  async draftReply(
    tenantId: string,
    threadId: string,
    actor: Actor,
    input: { instruction?: string; tone?: string; length?: string },
  ): Promise<{ variants: DraftVariant[]; subject: string }> {
    const instruction = this.cleanInstruction(input.instruction);
    const thread = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailThread.findUnique({ where: { id: threadId } }),
    );
    if (!thread) throw new NotFoundError('Hilo no encontrado');
    const conn = await this.connections.assertAccess(tenantId, thread.connectionId, actor);

    const messages = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailMessage.findMany({
        where: { threadId, isDraft: false },
        orderBy: { createdAt: 'asc' },
        select: {
          direction: true,
          fromAddress: true,
          fromName: true,
          text: true,
          html: true,
          detectedLang: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
        },
      }),
    );

    const lastInbound = [...messages].reverse().find((m) => m.direction === 'IN');
    const counterparty = lastInbound?.fromAddress ?? this.firstParticipant(thread.participants);
    const context = await this.gatherContext(tenantId, counterparty);
    const replyLang = this.replyLanguage(messages);

    const call = await this.run(tenantId, {
      system: this.systemPrompt({
        agentKnowledge: context.agentKnowledge,
        replyLang,
        tone: this.pickTone(input.tone),
        length: this.pickLength(input.length),
        signature: conn.signature,
      }),
      userPrompt: [
        this.crmBlock(context),
        '',
        'HILO DE CORREO (del más antiguo al más reciente):',
        this.threadBlock(thread.subject, messages),
        '',
        'INSTRUCCIÓN DEL USUARIO PARA LA RESPUESTA:',
        instruction,
      ].join('\n'),
      feature: 'mail_draft_reply',
      resourceId: threadId,
      resourceType: 'email_thread',
    });

    return { variants: this.toVariants(call.variants), subject: '' };
  }

  /** Draft a brand-new email from an instruction. */
  async draftNew(
    tenantId: string,
    connectionId: string,
    actor: Actor,
    input: { instruction?: string; to?: string; tone?: string; length?: string },
  ): Promise<{ variants: DraftVariant[]; subject: string }> {
    const instruction = this.cleanInstruction(input.instruction);
    const conn = await this.connections.assertAccess(tenantId, connectionId, actor);
    const context = await this.gatherContext(tenantId, (input.to ?? '').trim().toLowerCase() || null);

    const call = await this.run(tenantId, {
      system: this.systemPrompt({
        agentKnowledge: context.agentKnowledge,
        replyLang: 'es',
        tone: this.pickTone(input.tone),
        length: this.pickLength(input.length),
        signature: conn.signature,
        needsSubject: true,
      }),
      userPrompt: [
        this.crmBlock(context),
        '',
        'Es un correo NUEVO, no una respuesta. Propón también el asunto.',
        '',
        'INSTRUCCIÓN DEL USUARIO:',
        instruction,
      ].join('\n'),
      feature: 'mail_draft_new',
      resourceId: connectionId,
      resourceType: 'mail_connection',
    });

    return { variants: this.toVariants(call.variants), subject: (call.subject ?? '').trim() };
  }

  /**
   * Rework text the user already wrote. Works on the HTML they have in the
   * composer and returns sanitized HTML, so it round-trips safely.
   */
  async refine(
    tenantId: string,
    actor: Actor,
    input: { html?: string; action?: string; lang?: string },
  ): Promise<{ html: string }> {
    const source = (input.html ?? '').trim().slice(0, MAX_REFINE_CHARS);
    if (!htmlToText(source).trim()) throw new BadRequestError('No hay texto que retocar');

    const action = (input.action ?? '') as RefineAction;
    if (!(REFINE_ACTIONS as readonly string[]).includes(action)) {
      throw new BadRequestError('Acción no soportada');
    }

    let directive: string;
    if (action === 'traducir') {
      const lang = (input.lang ?? 'en').trim().toLowerCase();
      if (!SUPPORTED_LANGS[lang]) throw new BadRequestError('Idioma no soportado');
      directive = `Traduce el correo al ${SUPPORTED_LANGS[lang]} conservando el formato HTML.`;
    } else {
      directive = REFINE_HINT[action];
    }

    this.assertWithinRateLimit(tenantId);
    const call = await this.ai.complete({
      tenantId: tenantId,
      model: env.ANTHROPIC_DEFAULT_MODEL,
      system:
        'Reescribes correos de un equipo comercial. ' +
        `${directive} ` +
        'Devuelve ÚNICAMENTE el cuerpo en HTML simple (<p>, <br>, <strong>, <em>, <ul>, <li>, <a>), ' +
        'sin explicaciones ni comentarios y sin añadir firma. ' +
        'Si el texto termina en un bloque de firma (una línea con «—» seguida de nombre, ' +
        'empresa o teléfono), reprodúcelo EXACTAMENTE igual: no lo reescribas ni lo traduzcas. ' +
        'No inventes datos, cifras ni compromisos que no estén en el texto original.',
      userPrompt: source,
      maxTokens: 1500,
    });
    void this.ai.recordUsage({
      tenantId,
      feature: 'mail_refine',
      callResult: call,
      metadata: { action },
    });

    const html = sanitizeEmailHtml(this.stripFence(call.result));
    if (!htmlToText(html).trim()) {
      throw new AppError('INTERNAL', 'La IA no devolvió texto utilizable', 502);
    }
    return { html };
  }

  // ---- internals ----------------------------------------------------------

  private cleanInstruction(raw: string | undefined): string {
    const s = (raw ?? '').trim().slice(0, MAX_INSTRUCTION);
    if (!s) throw new BadRequestError('Escribe qué quieres decir y la IA redacta el correo');
    return s;
  }

  private pickTone(v: string | undefined): Tone {
    return (TONES as readonly string[]).includes(v ?? '') ? (v as Tone) : 'neutral';
  }

  private pickLength(v: string | undefined): Length {
    return (LENGTHS as readonly string[]).includes(v ?? '') ? (v as Length) : 'medio';
  }

  private firstParticipant(participants: unknown): string | null {
    return Array.isArray(participants) && typeof participants[0] === 'string'
      ? participants[0]
      : null;
  }

  /** Answer in the language the contact writes in, falling back to Spanish. */
  private replyLanguage(messages: { direction: string; detectedLang: string | null; text: string | null }[]): string {
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'IN');
    if (!lastInbound) return 'es';
    return lastInbound.detectedLang ?? guessLanguage(lastInbound.text ?? '') ?? 'es';
  }

  /**
   * CRM record behind the address plus the tenant's own product knowledge.
   *
   * Everything is best-effort: a missing lead or agent must degrade to a thinner
   * prompt, never fail the draft.
   */
  private async gatherContext(tenantId: string, address: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const email = (address ?? '').trim().toLowerCase();
      const lead = email
        ? await tx.lead.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true, name: true, company: true, status: true, score: true, source: true },
          })
        : null;
      const client = !lead && email
        ? await tx.client.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true, name: true, status: true },
          })
        : null;

      const opportunities = lead
        ? await tx.opportunity.findMany({
            where: { leadId: lead.id, status: 'OPEN' },
            orderBy: { updatedAt: 'desc' },
            take: 3,
            select: { name: true, amount: true, currency: true, expectedCloseDate: true, stage: { select: { label: true } } },
          })
        : [];

      const notes = lead
        ? await tx.note.findMany({
            where: { leadId: lead.id },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { body: true, createdAt: true },
          })
        : [];

      // Company knowledge lives on the tenant's published agent — reused rather
      // than duplicated in a second place the user would have to maintain.
      const agent = await tx.agent.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { updatedAt: 'desc' },
        select: { config: true },
      });
      const cfg = (agent?.config ?? {}) as { businessInfo?: string; faqs?: string };
      const knowledge = [
        cfg.businessInfo ? `INFORMACIÓN DE LA EMPRESA / PRODUCTO:\n${cfg.businessInfo}` : null,
        cfg.faqs ? `PREGUNTAS FRECUENTES:\n${cfg.faqs}` : null,
      ]
        .filter(Boolean)
        .join('\n\n');

      return { email, lead, client, opportunities, notes, agentKnowledge: knowledge };
    });
  }

  private crmBlock(ctx: Awaited<ReturnType<MailDraftAiService['gatherContext']>>): string {
    const lines: string[] = ['FICHA DEL CONTACTO (de nuestro CRM):'];
    if (ctx.lead) {
      lines.push(
        `- Lead: ${ctx.lead.name}${ctx.lead.company ? ` (${ctx.lead.company})` : ''}` +
          ` · estado ${ctx.lead.status}` +
          (ctx.lead.score != null ? ` · puntuación ${ctx.lead.score}/100` : '') +
          (ctx.lead.source ? ` · origen ${ctx.lead.source}` : ''),
      );
    } else if (ctx.client) {
      lines.push(`- Cliente: ${ctx.client.name} · estado ${ctx.client.status}`);
    } else {
      lines.push('- Sin ficha en el CRM.');
    }
    for (const o of ctx.opportunities) {
      lines.push(
        `- Oportunidad abierta: ${o.name}` +
          (o.amount ? ` · ${o.amount.toString()} ${o.currency}` : '') +
          (o.stage?.label ? ` · etapa ${o.stage.label}` : '') +
          (o.expectedCloseDate ? ` · cierre previsto ${o.expectedCloseDate.toISOString().slice(0, 10)}` : ''),
      );
    }
    for (const n of ctx.notes) {
      lines.push(`- Nota (${n.createdAt.toISOString().slice(0, 10)}): ${n.body.slice(0, 200)}`);
    }
    return lines.join('\n');
  }

  private threadBlock(
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
    const kept =
      messages.length <= MAX_THREAD_MESSAGES
        ? messages
        : messages.slice(messages.length - MAX_THREAD_MESSAGES);
    const head = `Asunto: ${subject ?? '(sin asunto)'}`;
    const body = kept
      .map((m) => {
        const who =
          m.direction === 'OUT' ? 'NOSOTROS' : `CONTACTO (${m.fromName || m.fromAddress || '?'})`;
        const when = (m.sentAt ?? m.receivedAt ?? m.createdAt).toISOString().slice(0, 10);
        const text = ((m.text ?? '').trim() || htmlToText(m.html ?? '')).slice(0, MAX_CHARS_PER_MESSAGE);
        return `--- ${when} · ${who} ---\n${text}`;
      })
      .join('\n\n');
    return `${head}\n\n${body}`;
  }

  private systemPrompt(o: {
    agentKnowledge: string;
    replyLang: string;
    tone: Tone;
    length: Length;
    signature: string | null;
    needsSubject?: boolean;
  }): string {
    const langName = SUPPORTED_LANGS[o.replyLang] ?? 'español';
    return [
      'Redactas correos en nombre de un equipo comercial español. Escribes el CUERPO del ' +
        'correo, nada más.',
      `Escribe en ${langName} — el idioma en que escribe el contacto.`,
      TONE_HINT[o.tone],
      LENGTH_HINT[o.length],
      'REGLA CRÍTICA: usa ÚNICAMENTE la información del hilo, de la ficha del CRM y del ' +
        'bloque de empresa. NUNCA inventes precios, plazos, descuentos, cifras ni ' +
        'compromisos. Si falta un dato para responder, deja escrito de forma natural que ' +
        'se confirmará, en lugar de inventarlo.',
      o.signature
        ? 'NO añadas firma ni despedida con nombre: el sistema añade la firma del buzón después.'
        : 'Cierra con una despedida breve sin inventar un nombre propio.',
      o.needsSubject
        ? 'Propón también un asunto corto y concreto.'
        : 'No propongas asunto: es una respuesta a un hilo existente.',
      'Devuelve dos variantes con enfoques distintos (por ejemplo una más directa y otra ' +
        'más explicativa), cada una con una etiqueta corta que las distinga.',
      // El conocimiento de producto del tenant va AL FINAL y solo si existe: es
      // el bloque grande, y sin él el asistente redacta genérico.
      o.agentKnowledge || null,
    ]
      .filter((x): x is string => !!x)
      .join('\n\n');
  }

  /** One assistant call, rate-limited and accounted. */
  private async run(
    tenantId: string,
    o: {
      system: string;
      userPrompt: string;
      feature: string;
      resourceType: string;
      resourceId: string;
    },
  ): Promise<{ variants: { label: string; body: string }[]; subject?: string }> {
    this.assertWithinRateLimit(tenantId);
    const call = await this.ai.callWithTool<{ variants: { label: string; body: string }[]; subject?: string }>({
      tenantId: tenantId,
      // Sonnet, not Haiku: this is writing, where quality is the whole point.
      model: env.ANTHROPIC_DEFAULT_MODEL,
      system: o.system,
      userPrompt: o.userPrompt,
      toolName: 'redactar_correo',
      toolDescription: 'Devuelve las variantes del cuerpo del correo.',
      toolInputSchema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 2000,
    });
    void this.ai.recordUsage({
      tenantId,
      feature: o.feature,
      callResult: call,
      resourceType: o.resourceType,
      resourceId: o.resourceId,
    });
    return call.result;
  }

  /** Sanitize every variant and drop the empty ones. */
  private toVariants(raw: { label: string; body: string }[] | undefined): DraftVariant[] {
    const out: DraftVariant[] = [];
    for (const [i, v] of (Array.isArray(raw) ? raw : []).entries()) {
      const html = sanitizeEmailHtml(this.stripFence(String(v?.body ?? '')));
      if (!htmlToText(html).trim()) continue;
      out.push({ label: String(v?.label ?? '').trim() || `Opción ${i + 1}`, html });
    }
    if (!out.length) throw new AppError('INTERNAL', 'La IA no devolvió un borrador utilizable', 502);
    return out.slice(0, 2);
  }

  /** Models sometimes wrap HTML in a ```html fence despite being told not to. */
  private stripFence(s: string): string {
    return s
      .trim()
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/```$/, '')
      .trim();
  }

  /**
   * In-process sliding window. Same single-instance assumption the campaign and
   * mail schedulers already make; if the API is ever scaled out this has to move
   * to Redis along with them.
   */
  private assertWithinRateLimit(tenantId: string): void {
    const now = Date.now();
    const cutoff = now - 60_000;
    const hits = (this.recentCalls.get(tenantId) ?? []).filter((t) => t > cutoff);
    if (hits.length >= RATE_LIMIT_PER_MINUTE) {
      this.logger.warn({ tenantId }, 'mail assistant rate limit hit');
      throw new AppError(
        'CONFLICT',
        'Has usado el asistente muchas veces en un minuto. Espera un momento y vuelve a intentarlo.',
        429,
      );
    }
    hits.push(now);
    this.recentCalls.set(tenantId, hits);
  }
}
