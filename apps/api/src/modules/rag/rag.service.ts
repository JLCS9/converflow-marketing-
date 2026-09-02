import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@converflow/db';
import { NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { embeddingsProviderFromEnv, type EmbeddingsProvider } from './embeddings.provider.js';

export interface RagSearchHit {
  id: string;
  content: string;
  meta: unknown;
  distance: number;
}

/** Serializa un embedding al literal `[x,y,...]` que pgvector castea. */
function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

/**
 * Memoria vectorial por tenant.
 *
 * REGLA DURA de aislamiento: toda consulta vectorial va por `$queryRaw`
 * DENTRO de la transacción de `withTenant` — el `SET LOCAL app.tenant_id`
 * solo vive ahí, y fuera de esa transacción el RLS no filtra. El test de
 * integración cross-tenant (rag-isolation.integration.spec.ts) verifica esto
 * contra una base real y es bloqueante en CI.
 *
 * REGLA DURA de contenido: `content` jamás lleva datos personales; el
 * contexto del caso va en `meta` (filtrable). Precio/stock nunca se
 * vectorizan.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly embeddings: EmbeddingsProvider = embeddingsProviderFromEnv();

  constructor(private readonly prisma: PrismaService) {}

  /** Embeddings crudos (lagunas, agrupaciones). Mismo proveedor que la memoria. */
  embedTexts(texts: string[]): Promise<number[][]> {
    return this.embeddings.embed(texts);
  }

  /** Crea la colección si no existe; fija modelo+dimensión en su nacimiento. */
  async ensureCollection(tenantId: string, key: string, name?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.ragCollection.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: {},
        create: {
          tenantId,
          key,
          name: name ?? key,
          embeddingModel: this.embeddings.model,
          dim: this.embeddings.dim,
        },
      }),
    );
  }

  /**
   * Vectoriza e inserta fragmentos. El embedding se calcula FUERA de la
   * transacción (lección de la casa: nunca una llamada externa dentro de un
   * `$transaction` de Prisma).
   */
  async addChunks(
    tenantId: string,
    collectionKey: string,
    chunks: { content: string; meta?: Record<string, unknown>; sourceRef?: string }[],
  ): Promise<{ inserted: number }> {
    if (chunks.length === 0) return { inserted: 0 };
    const collection = await this.ensureCollection(tenantId, collectionKey);
    const vectors = await this.embeddings.embed(chunks.map((c) => c.content));

    await this.prisma.withTenant(tenantId, async (tx) => {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        await tx.$executeRaw`
          INSERT INTO rag_chunks ("id", "tenantId", "collectionId", "content", "embedding", "meta", "sourceRef", "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${tenantId}, ${collection.id}, ${c.content},
                  ${vectorLiteral(vectors[i]!)}::vector,
                  ${c.meta ? JSON.stringify(c.meta) : null}::jsonb,
                  ${c.sourceRef ?? null}, now(), now())
        `;
      }
    });
    return { inserted: chunks.length };
  }

  /** Recuperación por similitud coseno con filtro opcional de metadatos. */
  async search(
    tenantId: string,
    collectionKey: string,
    query: string,
    opts: { k?: number; metaFilter?: Record<string, unknown> } = {},
  ): Promise<RagSearchHit[]> {
    const k = Math.min(Math.max(opts.k ?? 5, 1), 50);
    const [queryVector] = await this.embeddings.embed([query]);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const collection = await tx.ragCollection.findUnique({
        where: { tenantId_key: { tenantId, key: collectionKey } },
        select: { id: true },
      });
      if (!collection) throw new NotFoundError('Colección no encontrada');

      const metaFilter = opts.metaFilter
        ? Prisma.sql`AND meta @> ${JSON.stringify(opts.metaFilter)}::jsonb`
        : Prisma.empty;

      // RLS filtra por tenant porque estamos dentro de withTenant; el WHERE de
      // colección acota; el filtro de metadatos usa el índice GIN de ddl.sql.
      const rows = await tx.$queryRaw<
        { id: string; content: string; meta: unknown; distance: number }[]
      >`
        SELECT id, content, meta,
               (embedding <=> ${vectorLiteral(queryVector!)}::vector)::float8 AS distance
        FROM rag_chunks
        WHERE "collectionId" = ${collection.id}
          AND embedding IS NOT NULL
          ${metaFilter}
        ORDER BY embedding <=> ${vectorLiteral(queryVector!)}::vector
        LIMIT ${k}
      `;
      return rows;
    });
  }

  /**
   * Vectorización incremental (F2): embebe los fragmentos pendientes
   * (embedding NULL) en lotes. La escritura de conocimiento inserta el texto
   * al momento y encola esto — así el alta nunca espera a la API de
   * embeddings y un fallo de la API se reintenta sin perder nada.
   */
  async embedPending(tenantId: string, batchSize = 50): Promise<{ embedded: number }> {
    let embedded = 0;
    for (;;) {
      const pending = await this.prisma.withTenant(tenantId, (tx) =>
        tx.$queryRaw<{ id: string; content: string }[]>`
          SELECT id, content FROM rag_chunks
          WHERE embedding IS NULL
          ORDER BY "createdAt"
          LIMIT ${batchSize}
        `,
      );
      if (pending.length === 0) break;
      const vectors = await this.embeddings.embed(pending.map((c) => c.content));
      await this.prisma.withTenant(tenantId, async (tx) => {
        for (let i = 0; i < pending.length; i++) {
          await tx.$executeRaw`
            UPDATE rag_chunks
            SET embedding = ${vectorLiteral(vectors[i]!)}::vector, "updatedAt" = now()
            WHERE id = ${pending[i]!.id}
          `;
        }
      });
      embedded += pending.length;
      if (pending.length < batchSize) break;
    }
    return { embedded };
  }

  /** Inserta fragmentos SIN vectorizar (los embebe el job embedPending). */
  async addChunksDeferred(
    tenantId: string,
    collectionKey: string,
    chunks: { content: string; meta?: Record<string, unknown>; sourceRef?: string }[],
  ): Promise<{ inserted: number }> {
    if (chunks.length === 0) return { inserted: 0 };
    const collection = await this.ensureCollection(tenantId, collectionKey);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.ragChunk.createMany({
        data: chunks.map((c) => ({
          tenantId,
          collectionId: collection.id,
          content: c.content,
          meta: (c.meta as never) ?? undefined,
          sourceRef: c.sourceRef,
        })),
      }),
    );
    return { inserted: chunks.length };
  }

  /** Borra los fragmentos de un origen (re-vectorización incremental). */
  async deleteBySourceRef(tenantId: string, collectionKey: string, sourceRef: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const collection = await tx.ragCollection.findUnique({
        where: { tenantId_key: { tenantId, key: collectionKey } },
        select: { id: true },
      });
      if (!collection) return { deleted: 0 };
      const res = await tx.ragChunk.deleteMany({
        where: { collectionId: collection.id, sourceRef },
      });
      return { deleted: res.count };
    });
  }
}
