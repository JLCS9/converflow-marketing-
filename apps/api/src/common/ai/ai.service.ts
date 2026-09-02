import { Injectable, Logger } from '@nestjs/common';
import { traceLlmCall } from './langfuse-tracer.js';
import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '@converflow/shared';
import { env } from '../../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiBudgetService } from './ai-budget.service.js';

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

/**
 * Turn a raw Anthropic SDK failure into something a user can act on.
 *
 * Without this every provider problem reached the client as a bare
 * 500 "Internal server error" (AllExceptionsFilter's fallback), so a spent
 * credit balance, a revoked key and a typo in the model id were
 * indistinguishable from a bug in our code. This is exactly the failure mode
 * recorded as known issue #16: in June 2026 the Anthropic balance ran out and
 * the only symptom anywhere was a WARN in the logs, so the product just
 * appeared to do nothing.
 */
export function describeAiFailure(err: unknown): AppError {
  const status = (err as { status?: number })?.status;
  const raw = String((err as Error)?.message ?? err ?? '');
  const lower = raw.toLowerCase();

  if (lower.includes('credit balance') || lower.includes('billing')) {
    return new AppError(
      'INTERNAL',
      'Las funciones de IA están temporalmente agotadas. Hemos avisado a soporte; ' +
        'vuelve a intentarlo más tarde.',
      503,
    );
  }
  if (status === 401 || status === 403 || lower.includes('invalid x-api-key') || lower.includes('authentication')) {
    return new AppError(
      'INTERNAL',
      'Las funciones de IA no están disponibles por un problema de configuración. ' +
        'Hemos avisado a soporte.',
      503,
    );
  }
  if (status === 404 || lower.includes('not_found_error') || lower.includes('model:')) {
    return new AppError(
      'INTERNAL',
      'Las funciones de IA no están disponibles por un problema de configuración. ' +
        'Hemos avisado a soporte.',
      503,
    );
  }
  if (status === 429 || lower.includes('rate_limit')) {
    return new AppError(
      'CONFLICT',
      'Hay demasiadas peticiones de IA ahora mismo. Espera unos segundos y reinténtalo.',
      429,
    );
  }
  if (status === 529 || (status ?? 0) >= 500) {
    return new AppError(
      'INTERNAL',
      'Las funciones de IA están temporalmente sobrecargadas. Vuelve a intentarlo en un momento.',
      503,
    );
  }
  // El detalle técnico va SOLO al log del servidor, nunca al cliente.
  return new AppError('INTERNAL', 'No se pudo completar la operación de IA. Inténtalo de nuevo.', 502);
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: Anthropic | null = null;

  /**
   * Single funnel for every model call, so provider failures are reported the
   * same way no matter which feature triggered them.
   */
  private async invoke(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    try {
      return await this.getClient().messages.create(params);
    } catch (err) {
      const mapped = describeAiFailure(err);
      // El motivo técnico completo (proveedor, modelo, mensaje del SDK) queda
      // aquí, en el log del servidor. El error que viaja al cliente es genérico
      // a propósito: no revela qué proveedor de IA usamos.
      this.logger.warn(
        { err, model: params.model, provider: 'anthropic' },
        `AI call failed: ${String((err as Error)?.message ?? err).slice(0, 300)}`,
      );
      throw mapped;
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: AiBudgetService,
  ) {}

  private getClient(): Anthropic {
    if (this.client) return this.client;
    if (!env.ANTHROPIC_API_KEY) {
      throw new AppError(
        'INTERNAL',
        // Sin detalles de proveedor ni de infraestructura: esto lo lee un
        // usuario final del tenant, no quien administra el servidor.
        'Las funciones de IA no están activas en esta instalación. Contacta con soporte.',
        503,
      );
    }
    this.client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // Las claves «identity-linked» de la consola nueva exigen declarar el
      // workspace en cada petición; las claves de workspace clásicas no.
      defaultHeaders: env.ANTHROPIC_WORKSPACE_ID
        ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID }
        : undefined,
    });
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
    const model = opts.model ?? env.ANTHROPIC_DEFAULT_MODEL;
    const start = Date.now();

    const response = await this.invoke({
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
   * Free-form completion (no forced tool). Returns the assistant text + usage.
   * Used by the agent playground and agent replies.
   */
  async complete(opts: {
    model?: string;
    system?: string;
    userPrompt: string;
    maxTokens?: number;
  }): Promise<AiCallResult<string>> {
    const model = opts.model ?? env.ANTHROPIC_DEFAULT_MODEL;
    const start = Date.now();

    const response = await this.invoke({
      model,
      max_tokens: opts.maxTokens ?? 600,
      system: opts.system,
      messages: [{ role: 'user', content: opts.userPrompt }],
    });

    const durationMs = Date.now() - start;
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;
    const prices = PRICING[model] ?? { input: 0, output: 0 };
    const costUsd =
      (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output;

    return { result: text, inputTokens, outputTokens, totalTokens, costUsd, durationMs, model };
  }

  /**
   * Agentic tool-use loop: calls Claude with the given tools, executes any tool
   * calls via `executeTool`, feeds results back, and repeats until the model
   * stops calling tools (or maxIterations). Returns the final text + the list of
   * actions taken + aggregated usage.
   */
  async runAgentLoop(opts: {
    model?: string;
    system?: string;
    userPrompt: string;
    tools: { name: string; description: string; input_schema: Record<string, unknown> }[];
    executeTool: (name: string, input: unknown) => Promise<string>;
    maxIterations?: number;
    maxTokens?: number;
  }): Promise<AiCallResult<string> & { actions: { name: string; input: unknown; result: string }[] }> {
    const model = opts.model ?? env.ANTHROPIC_DEFAULT_MODEL;
    const start = Date.now();
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.userPrompt }];
    const actions: { name: string; input: unknown; result: string }[] = [];
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const maxIter = opts.maxIterations ?? 4;

    for (let i = 0; i < maxIter; i++) {
      const res = await this.invoke({
        model,
        max_tokens: opts.maxTokens ?? 800,
        system: opts.system,
        tools: opts.tools as never,
        messages,
      });
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;

      const textPart = res.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
      if (textPart) text = textPart;

      const toolUses = res.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (res.stop_reason !== 'tool_use' || toolUses.length === 0) break;

      messages.push({ role: 'assistant', content: res.content as never });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let result: string;
        try {
          result = await opts.executeTool(tu.name, tu.input);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : 'fallo en la herramienta'}`;
        }
        actions.push({ name: tu.name, input: tu.input, result });
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
      }
      messages.push({ role: 'user', content: results });
    }

    const totalTokens = inputTokens + outputTokens;
    const prices = PRICING[model] ?? { input: 0, output: 0 };
    const costUsd =
      (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output;

    return {
      result: text,
      actions,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
      durationMs: Date.now() - start,
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
    // Que el tope muerda dentro del mismo minuto, sin esperar a que caduque la
    // caché del presupuesto.
    this.budget.addSpend(opts.tenantId, opts.callResult.totalTokens);
    // Traza técnica (Langfuse) — no-op sin claves, jamás bloquea.
    traceLlmCall({
      tenantId: opts.tenantId,
      feature: opts.feature,
      model: opts.callResult.model,
      input: opts.metadata,
      inputTokens: opts.callResult.inputTokens,
      outputTokens: opts.callResult.outputTokens,
      costUsd: opts.callResult.costUsd ?? undefined,
      durationMs: opts.callResult.durationMs,
      error: opts.errorMessage,
    });
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
