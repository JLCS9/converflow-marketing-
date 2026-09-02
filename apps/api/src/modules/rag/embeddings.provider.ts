import { createHash } from 'node:crypto';

/**
 * Proveedor de embeddings intercambiable (misma filosofía que el proveedor de
 * LLM): la elección concreta se cierra en el benchmark de F0 y cambiarla
 * después es re-vectorizar una colección, nunca tocar este contrato.
 *
 * `stub` es determinista y sin red: sirve para tests y para desarrollar sin
 * clave. Los reales (`voyage`, `openai`) se configuran por entorno.
 */
export interface EmbeddingsProvider {
  readonly model: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Embedding determinista por hash — SOLO tests/desarrollo. */
export class StubEmbeddingsProvider implements EmbeddingsProvider {
  readonly model = 'stub-hash';
  readonly dim = 8;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const h = createHash('sha256').update(t.toLowerCase().trim()).digest();
      const v = Array.from({ length: this.dim }, (_, i) => h.readInt16BE(i * 2) / 32768);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
}

class HttpEmbeddingsProvider implements EmbeddingsProvider {
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    readonly model: string,
    readonly dim: number,
    private readonly shape: 'openai' | 'voyage',
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(
        this.shape === 'voyage'
          ? { model: this.model, input: texts, output_dimension: this.dim }
          : { model: this.model, input: texts, dimensions: this.dim },
      ),
    });
    if (!res.ok) {
      // El detalle va al log; nunca al cliente (mismo criterio que AiService).
      throw new Error(`embeddings provider ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    return [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

export function embeddingsProviderFromEnv(): EmbeddingsProvider {
  const provider = process.env.EMBEDDINGS_PROVIDER ?? 'stub';
  const apiKey = process.env.EMBEDDINGS_API_KEY ?? '';
  const model = process.env.EMBEDDINGS_MODEL ?? '';
  const dim = Number(process.env.EMBEDDINGS_DIM ?? 0);
  switch (provider) {
    case 'voyage':
      return new HttpEmbeddingsProvider(
        'https://api.voyageai.com/v1/embeddings',
        apiKey,
        model || 'voyage-3.5-lite',
        dim || 1024,
        'voyage',
      );
    case 'openai':
      return new HttpEmbeddingsProvider(
        'https://api.openai.com/v1/embeddings',
        apiKey,
        model || 'text-embedding-3-small',
        dim || 1536,
        'openai',
      );
    default:
      return new StubEmbeddingsProvider();
  }
}
