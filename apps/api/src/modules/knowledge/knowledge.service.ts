import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { RagService, type RagSearchHit } from '../rag/rag.service.js';
import { IngestQueue } from '../ingest/ingest.queue.js';
import { chunkText } from './chunker.js';

/** Umbral de distancia coseno: por debajo, una respuesta verificada gana. */
const VERIFIED_MAX_DISTANCE = 0.45;

export interface ContextBlock {
  kind: 'verified' | 'knowledge';
  content: string;
  meta: unknown;
  distance: number;
}

/**
 * Memoria gestionada del tenant (F2): conocimiento troceado y vectorizado en
 * diferido, respuestas verificadas con PRIORIDAD en recuperación,
 * instrucciones versionadas y lagunas agrupadas por similitud.
 */
/** sourceRef canónico de una fuente de texto (slug del título). */
export function textSourceRef(title: string): string {
  return `text:${title.toLowerCase().replace(/\s+/g, '-').slice(0, 60)}`;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
    private readonly queue: IngestQueue,
  ) {}

  // ---- conocimiento base ---------------------------------------------------


  /** Alta de una fuente de texto (FAQ, ficha, política…). Vectoriza en cola,
   *  salvo `syncEmbed` (camino del set de regresión: hay que poder comprobar
   *  la recuperación ANTES de dar el cambio por bueno). */
  async addTextSource(
    tenantId: string,
    opts: { title: string; text: string; meta?: Record<string, unknown> },
    mode: { syncEmbed?: boolean } = {},
  ) {
    const sourceRef = textSourceRef(opts.title);
    // Re-alta del mismo título = sustitución completa de sus fragmentos.
    await this.rag.deleteBySourceRef(tenantId, 'knowledge', sourceRef);
    const chunks = chunkText(opts.text).map((content) => ({
      content: `${opts.title}\n\n${content}`,
      meta: opts.meta,
      sourceRef,
    }));
    if (mode.syncEmbed) {
      const res = await this.rag.addChunks(tenantId, 'knowledge', chunks);
      return { ...res, sourceRef };
    }
    const res = await this.rag.addChunksDeferred(tenantId, 'knowledge', chunks);
    await this.queue.enqueueEmbed(tenantId);
    return { ...res, sourceRef };
  }

  /** Fuentes del panel: agrupadas por sourceRef con su estado de indexado. */
  async listSources(tenantId: string) {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.$queryRaw<
        { sourceRef: string; chunks: number; embedded: number; updatedAt: Date; sample: string }[]
      >`
        SELECT c."sourceRef",
               count(*)::int                    AS "chunks",
               count(c."embedding")::int        AS "embedded",
               max(c."updatedAt")               AS "updatedAt",
               min(c."content")                 AS "sample"
        FROM rag_chunks c
        JOIN rag_collections col ON col."id" = c."collectionId"
        WHERE col."key" = 'knowledge' AND c."sourceRef" IS NOT NULL
        GROUP BY c."sourceRef"
        ORDER BY max(c."updatedAt") DESC
      `,
    );
    // El título viaja como primera línea de cada fragmento (addTextSource).
    return rows.map((r) => ({
      sourceRef: r.sourceRef,
      title: r.sample.split('\n')[0] ?? r.sourceRef,
      chunks: r.chunks,
      embedded: r.embedded,
      updatedAt: r.updatedAt,
    }));
  }

  /** Baja de una fuente completa (todos sus fragmentos). */
  async deleteSource(tenantId: string, sourceRef: string) {
    if (!sourceRef.startsWith('text:')) throw new NotFoundError('Fuente no encontrada');
    await this.rag.deleteBySourceRef(tenantId, 'knowledge', sourceRef);
    return { ok: true };
  }

  // ---- respuestas verificadas ----------------------------------------------

  /** Nace de una corrección humana. El texto va GENERALIZADO (sin PII). */
  async addVerifiedAnswer(
    tenantId: string,
    opts: {
      question: string;
      answer: string;
      meta?: Record<string, unknown>;
      validUntil?: Date;
      verifiedBy?: string;
    },
  ) {
    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.verifiedAnswer.create({
        data: {
          tenantId,
          question: opts.question,
          answer: opts.answer,
          meta: (opts.meta as never) ?? undefined,
          validUntil: opts.validUntil,
          verifiedBy: opts.verifiedBy,
        },
      }),
    );
    await this.rag.addChunksDeferred(tenantId, 'verified', [
      {
        content: `P: ${opts.question}\nR: ${opts.answer}`,
        meta: { ...(opts.meta ?? {}), verifiedAnswerId: row.id },
        sourceRef: `va:${row.id}`,
      },
    ]);
    await this.queue.enqueueEmbed(tenantId);
    return row;
  }

  async listVerifiedAnswers(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.verifiedAnswer.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, question: true, answer: true, verifiedBy: true,
          validUntil: true, createdAt: true,
        },
      }),
    );
  }

  async deactivateVerifiedAnswer(tenantId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const row = await tx.verifiedAnswer.findUnique({ where: { id }, select: { id: true } });
      if (!row) throw new NotFoundError('Respuesta verificada no encontrada');
      await tx.verifiedAnswer.update({ where: { id }, data: { active: false } });
    });
    await this.rag.deleteBySourceRef(tenantId, 'verified', `va:${id}`);
    return { ok: true };
  }

  // ---- instrucciones ---------------------------------------------------------

  async listInstructions(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.tenantInstruction.findMany({ where: { active: true }, orderBy: { order: 'asc' } }),
    );
  }

  async setInstructions(tenantId: string, items: { content: string; source?: string }[]) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.tenantInstruction.updateMany({ where: {}, data: { active: false } });
      for (const [i, it] of items.entries()) {
        await tx.tenantInstruction.create({
          data: { tenantId, order: i, content: it.content, source: it.source ?? 'manual' },
        });
      }
      return { count: items.length };
    });
  }

  // ---- recuperación con prioridad -------------------------------------------

  /**
   * Contexto para el motor: primero respuestas verificadas (si alguna está
   * suficientemente cerca, va marcada como prioritaria), después conocimiento
   * base. El filtro de segmento entra por metadatos.
   */
  async retrieve(
    tenantId: string,
    query: string,
    opts: { k?: number; metaFilter?: Record<string, unknown> } = {},
  ): Promise<ContextBlock[]> {
    const k = opts.k ?? 4;
    const [verified, knowledge] = await Promise.all([
      this.rag
        .search(tenantId, 'verified', query, { k: 2, metaFilter: opts.metaFilter })
        .catch(() => [] as RagSearchHit[]),
      this.rag
        .search(tenantId, 'knowledge', query, { k, metaFilter: opts.metaFilter })
        .catch(() => [] as RagSearchHit[]),
    ]);
    const blocks: ContextBlock[] = [];
    for (const v of verified) {
      if (v.distance <= VERIFIED_MAX_DISTANCE) {
        blocks.push({ kind: 'verified', content: v.content, meta: v.meta, distance: v.distance });
      }
    }
    for (const h of knowledge) {
      blocks.push({ kind: 'knowledge', content: h.content, meta: h.meta, distance: h.distance });
    }
    return blocks.slice(0, k + 2);
  }

  // ---- lagunas ---------------------------------------------------------------

  /**
   * Registra una pregunta sin respuesta suficiente, agrupando por similitud
   * con las lagunas abiertas (distancia coseno sobre el embedding de la
   * pregunta). `hasWaitingLead` sube la prioridad: hay una persona esperando.
   */
  async recordGap(
    tenantId: string,
    question: string,
    opts: { hasWaitingLead?: boolean; conversationId?: string } = {},
  ) {
    const [vector] = await this.rag.embedTexts([question]);
    const lit = `[${vector!.join(',')}]`;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const similar = await tx.$queryRaw<{ id: string; distance: number }[]>`
        SELECT id, (embedding <=> ${lit}::vector)::float8 AS distance
        FROM knowledge_gaps
        WHERE status = 'OPEN' AND embedding IS NOT NULL
        ORDER BY embedding <=> ${lit}::vector
        LIMIT 1
      `;
      const hit = similar[0];
      if (hit && hit.distance <= 0.35) {
        await tx.$executeRaw`
          UPDATE knowledge_gaps
          SET count = count + 1,
              "hasWaitingLead" = "hasWaitingLead" OR ${opts.hasWaitingLead ?? false},
              samples = (COALESCE(samples, '[]'::jsonb) || to_jsonb(${question}::text)),
              "conversationId" = COALESCE(${opts.conversationId ?? null}, "conversationId"),
              "updatedAt" = now()
          WHERE id = ${hit.id}
        `;
        return { id: hit.id, grouped: true };
      }
      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO knowledge_gaps ("id", "tenantId", "question", "count", "status", "hasWaitingLead", "embedding", "samples", "conversationId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${tenantId}, ${question}, 1, 'OPEN', ${opts.hasWaitingLead ?? false}, ${lit}::vector, to_jsonb(ARRAY[${question}::text]), ${opts.conversationId ?? null}, now(), now())
        RETURNING id
      `;
      return { id: rows[0]!.id, grouped: false };
    });
  }

  async listGaps(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.knowledgeGap.findMany({
        where: { status: 'OPEN' },
        orderBy: [{ hasWaitingLead: 'desc' }, { count: 'desc' }],
        select: {
          id: true, question: true, count: true, hasWaitingLead: true,
          samples: true, createdAt: true, updatedAt: true,
        },
      }),
    );
  }

  /** Descartar una laguna (ruido, fuera de alcance…). No genera verificada. */
  async dismissGap(tenantId: string, gapId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const gap = await tx.knowledgeGap.findUnique({ where: { id: gapId }, select: { id: true } });
      if (!gap) throw new NotFoundError('Laguna no encontrada');
      await tx.knowledgeGap.update({ where: { id: gapId }, data: { status: 'DISMISSED' } });
      return { ok: true };
    });
  }

  /** Cerrar una laguna respondiéndola: crea la verificada y marca COVERED. */
  async coverGap(
    tenantId: string,
    gapId: string,
    answer: string,
    verifiedBy?: string,
  ) {
    const gap = await this.prisma.withTenant(tenantId, (tx) =>
      tx.knowledgeGap.findUnique({ where: { id: gapId } }),
    );
    if (!gap) throw new NotFoundError('Laguna no encontrada');
    const va = await this.addVerifiedAnswer(tenantId, {
      question: gap.question,
      answer,
      verifiedBy,
      meta: { fromGap: gapId },
    });
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.knowledgeGap.update({ where: { id: gapId }, data: { status: 'COVERED' } }),
    );
    return va;
  }
}
