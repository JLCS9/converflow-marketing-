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
    leadContext?: {
      name: string;
      company?: string | null;
      email?: string | null;
      phone?: string | null;
      source?: string | null;
      status?: string;
      score?: number | null;
    };
    clientContext?: { name: string; email?: string | null };
    /** Previous notes WITH their AI classifications so Claude can avoid repeating itself. */
    priorNotes?: Array<{
      body: string;
      category?: string | null;
      suggestedReply?: string | null;
      analyzedAt?: Date | null;
    }>;
    /** Active opportunities so the reply can reference current deal stage. */
    opportunities?: Array<{
      name: string;
      status: string;
      amount?: string | number | null;
      probability?: number | null;
    }>;
    /** Pending tasks tied to the lead/client. */
    pendingTasks?: Array<{ title: string; type: string; dueAt?: Date | null }>;
  }) {
    const contextLines: string[] = [];

    if (opts.leadContext) {
      const l = opts.leadContext;
      contextLines.push(
        `LEAD: ${l.name}` +
          (l.company ? ` · ${l.company}` : '') +
          (l.status ? ` · status=${l.status}` : '') +
          (l.score != null ? ` · score=${l.score}/100` : '') +
          (l.source ? ` · fuente=${l.source}` : ''),
      );
      if (l.email) contextLines.push(`  email: ${l.email}`);
      if (l.phone) contextLines.push(`  tel: ${l.phone}`);
    }
    if (opts.clientContext) {
      contextLines.push(`CLIENTE: ${opts.clientContext.name}`);
    }

    if (opts.opportunities?.length) {
      contextLines.push('');
      contextLines.push('OPORTUNIDADES ACTIVAS:');
      for (const o of opts.opportunities) {
        contextLines.push(
          `  - "${o.name}" status=${o.status}` +
            (o.amount ? ` · ${o.amount}€` : '') +
            (o.probability != null ? ` · ${o.probability}% prob` : ''),
        );
      }
    }

    if (opts.pendingTasks?.length) {
      contextLines.push('');
      contextLines.push('TAREAS PENDIENTES:');
      for (const t of opts.pendingTasks.slice(0, 5)) {
        contextLines.push(
          `  - [${t.type}] ${t.title}` + (t.dueAt ? ` (vence ${t.dueAt.toISOString().slice(0, 10)})` : ''),
        );
      }
    }

    if (opts.priorNotes?.length) {
      contextLines.push('');
      contextLines.push('NOTAS Y MENSAJES PREVIOS (no repitas estas respuestas):');
      for (const n of opts.priorNotes.slice(0, 5)) {
        const date = n.analyzedAt ? n.analyzedAt.toISOString().slice(0, 10) : 's/f';
        const cat = n.category ? ` [${n.category}]` : '';
        contextLines.push(`  - [${date}]${cat} ${n.body.slice(0, 150)}`);
        if (n.suggestedReply) {
          contextLines.push(`    ↳ ya sugerimos: "${n.suggestedReply.slice(0, 120)}"`);
        }
      }
    }

    const context = contextLines.join('\n');

    return this.callWithTool<{
      category: string;
      categoryReasoning: string;
      sentiment: string;
      confidence: number;
      suggestedReply: string;
    }>({
      model: env.ANTHROPIC_FAST_MODEL,
      system:
        'Eres un asistente comercial B2B en castellano. Clasificas mensajes y sugieres respuestas CORTAS, concretas y diferentes a las anteriores. Tu output va directo al copy/paste de un comercial — escribe en primera persona, sin saludos genéricos, sin firmas, sin placeholders.',
      userPrompt: [
        'Analiza este mensaje y devuelve la clasificación + respuesta vía `analyze_note`.',
        '',
        context ? `CONTEXTO COMPLETO DEL CONTACTO:\n${context}\n` : '',
        `MENSAJE A CLASIFICAR:\n"""${opts.noteBody}"""`,
        '',
        'CATEGORÍAS:',
        '- BUY_INTENT: interés en comprar, pide demo/precio/condiciones',
        '- OBJECTION: objeción a manejar (precio, competencia, features)',
        '- INFO_REQUEST: pide info genérica',
        '- COMPLAINT: queja o problema',
        '- SCHEDULING: quiere agendar reunión',
        '- OFF_TOPIC: no relacionado con la venta',
        '- OTHER: ninguna de las anteriores',
        '',
        'SENTIMIENTO: POSITIVE | NEUTRAL | NEGATIVE | URGENT',
        '',
        'REGLAS PARA LA RESPUESTA SUGERIDA:',
        '- MÁXIMO 300 caracteres (cuenta).',
        '- En español, primera persona ("te paso", "te confirmo").',
        '- Sin saludos ("Hola", "Buenos días") ni despedidas ("Un saludo", "Atentamente").',
        '- Sin placeholders ([nombre], [empresa]). Usa los datos del CONTEXTO.',
        '- Si hay NOTAS PREVIAS con respuestas ya sugeridas, NO repitas tono ni argumentos: cambia el ángulo (si antes fue racional, ahora apela a urgencia; si fue genérico, ahora referencia algo específico del contexto).',
        '- Si la categoría es OBJECTION, incluye 1 argumento contraintuitivo o un dato concreto.',
        '- Si hay oportunidades activas, referénciala explícitamente cuando proceda.',
        '',
        'REGLA PARA categoryReasoning: máximo 150 caracteres, español, telegráfico.',
      ].join('\n'),
      toolName: 'analyze_note',
      toolDescription:
        'Submit the classification, sentiment, confidence and a ready-to-send reply (≤300 chars) for this note.',
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
          categoryReasoning: { type: 'string', maxLength: 200 },
          sentiment: {
            type: 'string',
            enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'URGENT'],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          suggestedReply: { type: 'string', maxLength: 320 },
        },
        required: ['category', 'sentiment', 'confidence', 'suggestedReply'],
      },
      maxTokens: 500,
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
