import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '@converflow/shared';
import { env } from '../../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Rough per-1M-token pricing in USD (update when Anthropic publishes new rates).
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};

export interface AiCallResult<T> {
  result: T;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  model: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: Anthropic | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private getClient(): Anthropic {
    if (this.client) return this.client;
    if (!env.ANTHROPIC_API_KEY) {
      throw new AppError(
        'INTERNAL',
        'IA no está configurada. Define ANTHROPIC_API_KEY en .env.prod y reinicia el contenedor.',
        503,
      );
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return this.client;
  }

  /**
   * Call Claude with a single tool defined so the response is forced into a
   * known JSON shape. Returns the parsed tool input plus usage metadata.
   * Caller is responsible for persisting `AiUsage` via `recordUsage()` —
   * we don't do it here so the caller can attach resourceType/resourceId
   * context that this layer doesn't know about.
   */
  async callWithTool<T>(opts: {
    model?: string;
    system?: string;
    userPrompt: string;
    toolName: string;
    toolDescription: string;
    toolInputSchema: Record<string, unknown>;
    maxTokens?: number;
  }): Promise<AiCallResult<T>> {
    const client = this.getClient();
    const model = opts.model ?? env.ANTHROPIC_DEFAULT_MODEL;
    const start = Date.now();

    const response = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription,
          input_schema: opts.toolInputSchema as never,
        },
      ],
      tool_choice: { type: 'tool', name: opts.toolName },
      messages: [{ role: 'user', content: opts.userPrompt }],
    });

    const durationMs = Date.now() - start;
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new AppError('INTERNAL', 'Modelo IA no devolvió tool_use', 502);
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;
    const prices = PRICING[model] ?? { input: 0, output: 0 };
    const costUsd = (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output;

    return {
      result: toolUse.input as T,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
      durationMs,
      model,
    };
  }

  /**
   * Classify a note's content and suggest a reply. Returns structured output
   * via Claude tool calling. Callers should pass enough context (e.g., who's
   * the lead, recent notes) so the reply is relevant.
   */
  async classifyNote(opts: {
    noteBody: string;
    leadContext?: { name: string; company?: string | null; status?: string };
    clientContext?: { name: string };
    recentMessages?: string[];
  }) {
    const context = [
      opts.leadContext &&
        `Lead: ${opts.leadContext.name}${opts.leadContext.company ? ` (${opts.leadContext.company})` : ''} — status ${opts.leadContext.status ?? '?'}`,
      opts.clientContext && `Cliente: ${opts.clientContext.name}`,
      opts.recentMessages?.length &&
        `Mensajes anteriores (más reciente primero):\n${opts.recentMessages
          .slice(0, 5)
          .map((m, i) => `${i + 1}. ${m.slice(0, 200)}`)
          .join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    return this.callWithTool<{
      category: string;
      categoryReasoning: string;
      sentiment: string;
      confidence: number;
      suggestedReply: string;
    }>({
      model: env.ANTHROPIC_FAST_MODEL,
      system:
        'Eres un asistente comercial B2B en castellano. Clasificas mensajes de clientes/leads y sugieres respuestas concisas, profesionales y accionables. Responde siempre en español.',
      userPrompt: [
        'Analiza el siguiente mensaje/nota y devuelve la clasificación + una respuesta sugerida vía la herramienta `analyze_note`.',
        '',
        context ? `Contexto:\n${context}\n` : '',
        `Mensaje a clasificar:\n"""${opts.noteBody}"""`,
        '',
        'Categorías:',
        '- BUY_INTENT: interés explícito en comprar, pide demo, presupuesto, condiciones.',
        '- OBJECTION: objeción a manejar (precio alto, competencia, características que no convencen).',
        '- INFO_REQUEST: pide información genérica del producto/servicio.',
        '- COMPLAINT: queja, problema con el servicio existente, frustración.',
        '- SCHEDULING: quiere agendar reunión/llamada/visita.',
        '- OFF_TOPIC: mensaje no relacionado con la venta.',
        '- OTHER: cualquier otro caso.',
        '',
        'Sentimiento: POSITIVE | NEUTRAL | NEGATIVE | URGENT.',
        '',
        'Respuesta sugerida: máximo 400 caracteres, en castellano, tono profesional pero cercano, ' +
          'lista para enviar tal cual (NO uses placeholders tipo [tu nombre] — usa primera persona ' +
          'directa). Si la categoría es OBJECTION, incluye 1 argumento que la rebate.',
      ].join('\n'),
      toolName: 'analyze_note',
      toolDescription:
        'Submit the classification, sentiment, confidence and a ready-to-send reply for this note.',
      toolInputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [
              'BUY_INTENT',
              'OBJECTION',
              'INFO_REQUEST',
              'COMPLAINT',
              'SCHEDULING',
              'OFF_TOPIC',
              'OTHER',
            ],
          },
          categoryReasoning: { type: 'string' },
          sentiment: {
            type: 'string',
            enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'URGENT'],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          suggestedReply: { type: 'string' },
        },
        required: ['category', 'sentiment', 'confidence', 'suggestedReply'],
      },
      maxTokens: 600,
    });
  }

  /**
   * Persist an AiUsage row (with RLS scoped to tenant). Idempotent failures
   * are swallowed — losing a usage log shouldn't break the user-facing call.
   */
  async recordUsage(opts: {
    tenantId: string;
    feature: string;
    callResult: AiCallResult<unknown>;
    resourceType?: string;
    resourceId?: string;
    status?: 'OK' | 'ERROR';
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.withTenant(opts.tenantId, (tx) =>
        tx.aiUsage.create({
          data: {
            tenantId: opts.tenantId,
            feature: opts.feature,
            model: opts.callResult.model,
            inputTokens: opts.callResult.inputTokens,
            outputTokens: opts.callResult.outputTokens,
            totalTokens: opts.callResult.totalTokens,
            costUsd: opts.callResult.costUsd,
            durationMs: opts.callResult.durationMs,
            status: opts.status ?? 'OK',
            errorMessage: opts.errorMessage,
            resourceType: opts.resourceType,
            resourceId: opts.resourceId,
            metadata: opts.metadata as never,
          },
        }),
      );
    } catch (err) {
      this.logger.warn({ err }, 'ai_usage write failed');
    }
  }
}
