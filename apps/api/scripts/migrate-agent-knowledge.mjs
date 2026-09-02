#!/usr/bin/env node
/**
 * E1 · Migración idempotente del conocimiento de los agentes al Conocimiento
 * del tenant:
 *   - config.businessInfo → fuente `agent:<id>:businessInfo`
 *   - config.faqs         → fuente `agent:<id>:faqs`
 *   - systemPrompt        → TenantInstruction (source `migrated:agent:<id>`)
 *
 * Uso (con DATABASE_URL/DIRECT y EMBEDDINGS_* en el entorno):
 *   node apps/api/scripts/migrate-agent-knowledge.mjs [--tenant <id>] [--dry]
 *
 * Idempotencia: salta cualquier pieza cuyo sourceRef/source ya exista.
 * La vectorización usa el flujo normal (fragmentos pendientes + job embed
 * al arrancar la API, o `rag.embedPending` si corre la API).
 */
import { PrismaClient } from '@converflow/db';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const only = args.includes('--tenant') ? args[args.indexOf('--tenant') + 1] : null;
const dry = args.includes('--dry');

/** Mismo troceado que el chunker de la API (aprox: párrafos ~1500). */
function chunkText(text) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > 1500 && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function bypass(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
    return fn(tx);
  });
}

const agents = await bypass((tx) =>
  tx.agent.findMany({
    where: {
      type: 'CONVERSATIONAL',
      status: { not: 'ARCHIVED' },
      ...(only ? { tenantId: only } : {}),
    },
    select: { id: true, tenantId: true, name: true, systemPrompt: true, config: true },
  }),
);

let sources = 0;
let instructions = 0;
for (const agent of agents) {
  const cfg = agent.config ?? {};
  const pieces = [
    { key: 'businessInfo', title: `Información de ${agent.name}`, text: cfg.businessInfo },
    { key: 'faqs', title: `FAQs de ${agent.name}`, text: cfg.faqs },
  ];

  for (const piece of pieces) {
    const text = (piece.text ?? '').trim();
    if (text.length < 20) continue;
    const sourceRef = `agent:${agent.id}:${piece.key}`;
    const done = await bypass(async (tx) => {
      const col = await tx.ragCollection.findUnique({
        where: { tenantId_key: { tenantId: agent.tenantId, key: 'knowledge' } },
        select: { id: true },
      });
      if (col) {
        const existing = await tx.ragChunk.findFirst({
          where: { collectionId: col.id, sourceRef },
          select: { id: true },
        });
        if (existing) return 'skip';
      }
      if (dry) return 'dry';
      const collection =
        col ??
        (await tx.ragCollection.create({
          data: {
            tenantId: agent.tenantId,
            key: 'knowledge',
            embeddingModel: process.env.EMBEDDINGS_MODEL ?? 'voyage-3.5-lite',
            dim: Number(process.env.EMBEDDINGS_DIM ?? 1024),
          },
          select: { id: true },
        }));
      for (const content of chunkText(text)) {
        await tx.ragChunk.create({
          data: {
            tenantId: agent.tenantId,
            collectionId: collection.id,
            content: `${piece.title}\n\n${content}`,
            sourceRef,
            meta: { migratedFrom: `agent:${agent.id}` },
          },
        });
      }
      return 'ok';
    });
    if (done === 'ok') sources++;
    console.log(`[${agent.tenantId}] ${sourceRef}: ${done}`);
  }

  const sys = (agent.systemPrompt ?? '').trim();
  if (sys.length >= 3) {
    const source = `migrated:agent:${agent.id}`;
    const done = await bypass(async (tx) => {
      const existing = await tx.tenantInstruction.findFirst({
        where: { tenantId: agent.tenantId, source },
        select: { id: true },
      });
      if (existing) return 'skip';
      if (dry) return 'dry';
      const last = await tx.tenantInstruction.findFirst({
        where: { tenantId: agent.tenantId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      await tx.tenantInstruction.create({
        data: {
          tenantId: agent.tenantId,
          order: (last?.order ?? -1) + 1,
          content: sys.slice(0, 2000),
          source,
        },
      });
      return 'ok';
    });
    if (done === 'ok') instructions++;
    console.log(`[${agent.tenantId}] instrucción ${source}: ${done}`);
  }
}

console.log(`\nHecho: ${sources} fuentes y ${instructions} instrucciones migradas de ${agents.length} agentes.`);
console.log('Recuerda: los fragmentos quedan PENDIENTES de vectorizar (el job embed los coge al llegar actividad, o reinicia la API).');
await prisma.$disconnect();
