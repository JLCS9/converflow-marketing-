import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError, BadRequestError, resolveLocale } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { env } from '../../config/env.js';

const LANG_NAME: Record<string, string> = { es: 'español', en: 'inglés', fr: 'francés' };

export interface ConversationSummary {
  bullets: string[];
  /** Peticiones del contacto que siguen sin resolver. */
  asks: string[];
  nextStep: string;
}

/** Mismos topes que el resumen de correo: un hilo largo dispara el coste. */
const MAX_MESSAGES_IN_PROMPT = 20;
const MAX_CHARS_PER_MESSAGE = 1000;

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    bullets: {
      type: 'array',
      items: { type: 'string' },
      description: '3 a 5 viñetas con lo que ha pasado en la conversación, en orden cronológico.',
    },
    asks: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Peticiones concretas del contacto que siguen sin resolver. Lista vacía si no hay ninguna.',
    },
    nextStep: {
      type: 'string',
      description: 'Una frase con la siguiente acción concreta que debería hacer el equipo.',
    },
  },
  required: ['bullets', 'asks', 'nextStep'],
} as const;

const CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    answers_gap: {
      type: 'boolean',
      description:
        'true SOLO si la respuesta del agente humano responde de verdad la pregunta pendiente (no un "te llamo luego" ni un saludo).',
    },
    question_general: {
      type: 'string',
      description:
        'La pregunta reformulada en general, sin nombres, teléfonos, emails ni datos de la persona concreta.',
    },
    answer_general: {
      type: 'string',
      description:
        'La respuesta reformulada en general, válida para cualquiera que pregunte lo mismo. Sin PII y sin promesas específicas a esta persona.',
    },
  },
  required: ['answers_gap'],
} as const;

/**
 * F3 · IA sobre conversaciones del CRM:
 *  - resumen cacheado (mismo patrón que MailAiService: la caché en BD es
 *    requisito de diseño — el inbox re-lee la conversación abierta en polling)
 *  - bucle corrección→verificada: cuando un humano responde una conversación
 *    con laguna abierta, la respuesta se generaliza (sin PII) y pasa a ser
 *    respuesta verificada con prioridad sobre el RAG base.
 */
@Injectable()
export class ConversationAiService {
  private readonly logger = new Logger(ConversationAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly knowledge: KnowledgeService,
  ) {}

  // ---- resumen ---------------------------------------------------------------

  async summarize(
    tenantId: string,
    conversationId: string,
    opts: { force?: boolean; locale?: string } = {},
  ): Promise<{ summary: ConversationSummary; cached: boolean; at: Date }> {
    const conv = await this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.findUnique({ where: { id: conversationId } }),
    );
    if (!conv) throw new NotFoundError('Conversación no encontrada');

    const messages = await this.prisma.withTenant(tenantId, (tx) =>
      tx.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        select: { direction: true, body: true, createdAt: true },
      }),
    );
    if (!messages.length) throw new BadRequestError('La conversación no tiene mensajes que resumir');

    const cachedLocale = (conv.aiSummary as { _locale?: string } | null)?._locale;
    const wantLocale = resolveLocale(opts.locale);
    const fresh =
      !opts.force &&
      conv.aiSummary != null &&
      conv.aiSummaryMsgCount === messages.length &&
      cachedLocale === wantLocale;
    if (fresh) {
      return {
        summary: conv.aiSummary as unknown as ConversationSummary,
        cached: true,
        at: conv.aiSummaryAt ?? new Date(),
      };
    }

    const recent = messages.slice(-MAX_MESSAGES_IN_PROMPT);
    const transcript = recent
      .map((m) => `${m.direction === 'IN' ? 'Contacto' : 'Nosotros'}: ${(m.body ?? '').slice(0, MAX_CHARS_PER_MESSAGE)}`)
      .join('\n');
    const handoff = conv.handoffContext as Record<string, unknown> | null;

    // Llamada FUERA de cualquier transacción (withTenant abre una interactiva
    // con timeout de 5s y Claude tarda más).
    const call = await this.ai.callWithTool<ConversationSummary>({
      tenantId,
      model: env.ANTHROPIC_FAST_MODEL,
      system:
        'Eres un asistente que resume conversaciones de clientes para un equipo comercial. ' +
        'Resume SOLO lo que aparece: no inventes datos, cifras ni compromisos. Directo y sin relleno. ' +
        `Escribe el resumen en ${LANG_NAME[wantLocale] ?? 'español'}.`,
      userPrompt:
        `${messages.length > recent.length ? `(conversación de ${messages.length} mensajes; se muestran los últimos ${recent.length})\n` : ''}` +
        `${handoff ? `CONTEXTO DE ESCALADO DEL BOT: ${JSON.stringify(handoff)}\n\n` : ''}` +
        `CONVERSACIÓN (canal ${conv.channel}):\n${transcript}`,
      toolName: 'resumir_conversacion',
      toolDescription: 'Devuelve el resumen estructurado de la conversación.',
      toolInputSchema: SUMMARY_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 700,
    });

    const summary: ConversationSummary = {
      bullets: Array.isArray(call.result.bullets) ? call.result.bullets.slice(0, 6) : [],
      asks: Array.isArray(call.result.asks) ? call.result.asks.slice(0, 6) : [],
      nextStep: call.result.nextStep?.trim() || '—',
    };
    const at = new Date();
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.conversation.update({
        where: { id: conversationId },
        data: {
          aiSummary: { ...summary, _locale: wantLocale } as unknown as object,
          aiSummaryAt: at,
          aiSummaryMsgCount: messages.length,
        },
      }),
    );
    void this.ai.recordUsage({
      tenantId,
      feature: 'conversation_summary',
      callResult: call,
      resourceType: 'conversation',
      resourceId: conversationId,
    });

    return { summary, cached: false, at };
  }

  // ---- corrección humana → respuesta verificada -------------------------------

  /**
   * Se llama (fire-and-forget) cuando un HUMANO envía una respuesta desde el
   * panel. Si la conversación tiene una laguna abierta, un modelo rápido
   * decide si la respuesta la cubre y la generaliza sin PII; en ese caso nace
   * una respuesta verificada y la laguna queda COVERED. Así, la siguiente
   * pregunta similar se responde sola — el criterio de aceptación de F3.
   */
  async learnFromHumanReply(
    tenantId: string,
    conversationId: string,
    humanText: string,
    reviewerEmail?: string,
  ): Promise<{ learned: boolean; verifiedId?: string }> {
    if (!humanText || humanText.trim().length < 10) return { learned: false };

    const gap = await this.prisma.withTenant(tenantId, (tx) =>
      tx.knowledgeGap.findFirst({
        where: { conversationId, status: 'OPEN' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, question: true },
      }),
    );
    if (!gap) return { learned: false };

    const call = await this.ai.callWithTool<{
      answers_gap: boolean;
      question_general?: string;
      answer_general?: string;
    }>({
      tenantId,
      model: this.ai.modelFor('classify'),
      system:
        'Un asistente de IA no supo responder una pregunta de un cliente y un agente humano acaba de contestar. ' +
        'Tu trabajo: decidir si esa respuesta humana RESPONDE de verdad la pregunta pendiente y, si lo hace, ' +
        'reformular pregunta y respuesta en GENERAL — sin nombres, teléfonos, emails, importes pactados ' +
        'ni ningún dato de la persona concreta — para que sirvan a cualquiera que pregunte lo mismo. ' +
        'Si la respuesta es un aplazamiento ("te llamo luego"), un saludo o algo específico de esa persona, answers_gap = false.',
      userPrompt: `PREGUNTA PENDIENTE:\n${gap.question}\n\nRESPUESTA DEL AGENTE HUMANO:\n${humanText.slice(0, 2000)}`,
      toolName: 'evaluar_correccion',
      toolDescription: 'Decide si la respuesta humana cubre la laguna y generalízala.',
      toolInputSchema: CORRECTION_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 600,
    });

    void this.ai.recordUsage({
      tenantId,
      feature: 'correction_capture',
      callResult: call,
      resourceType: 'conversation',
      resourceId: conversationId,
      metadata: { gapId: gap.id, learned: call.result.answers_gap === true },
    });

    const out = call.result;
    if (out.answers_gap !== true || !out.question_general?.trim() || !out.answer_general?.trim()) {
      return { learned: false };
    }

    const va = await this.knowledge.addVerifiedAnswer(tenantId, {
      question: out.question_general.trim(),
      answer: out.answer_general.trim(),
      verifiedBy: reviewerEmail,
      meta: { fromGap: gap.id, fromConversation: conversationId, source: 'human_correction' },
    });
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.knowledgeGap.update({ where: { id: gap.id }, data: { status: 'COVERED' } }),
    );
    this.logger.log(
      { conversationId, gapId: gap.id, verifiedId: va.id },
      'corrección humana capturada como respuesta verificada',
    );
    return { learned: true, verifiedId: va.id };
  }
}
