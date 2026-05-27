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
