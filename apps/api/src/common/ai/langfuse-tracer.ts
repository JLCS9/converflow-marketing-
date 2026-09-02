import { Langfuse } from 'langfuse';

/**
 * Traza técnica de cada llamada LLM en Langfuse (Cloud UE). Activada SOLO si
 * hay claves en el entorno; sin ellas es un no-op y no cuesta nada. Es
 * complementaria a la tabla ai_usage: ai_usage = contador de negocio y
 * presupuesto; Langfuse = traza para depurar prompts, coste y latencia.
 *
 * Fire-and-forget deliberado: perder una traza jamás rompe la llamada del
 * usuario (mismo criterio que recordUsage).
 */
let client: Langfuse | null | undefined;

function getClient(): Langfuse | null {
  if (client !== undefined) return client;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    client = null;
    return client;
  }
  client = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
    flushAt: 1,
  });
  return client;
}

export interface LlmTrace {
  tenantId?: string;
  feature?: string;
  model: string;
  input: unknown;
  output?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  durationMs: number;
  error?: string;
}

export function traceLlmCall(t: LlmTrace): void {
  const lf = getClient();
  if (!lf) return;
  try {
    const trace = lf.trace({
      name: t.feature ?? 'llm-call',
      userId: t.tenantId,
      tags: t.tenantId ? [`tenant:${t.tenantId}`] : undefined,
    });
    trace.generation({
      name: t.feature ?? 'llm-call',
      model: t.model,
      input: t.input,
      output: t.output,
      usage: { input: t.inputTokens, output: t.outputTokens, totalCost: t.costUsd },
      level: t.error ? 'ERROR' : 'DEFAULT',
      statusMessage: t.error,
      endTime: new Date(),
      startTime: new Date(Date.now() - t.durationMs),
    });
    void lf.flushAsync().catch(() => undefined);
  } catch {
    /* nunca romper la llamada por una traza */
  }
}
