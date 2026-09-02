#!/usr/bin/env node
/**
 * Mini-benchmark de embeddings (decisión F0 del motor de IA).
 *
 * Compara proveedores/modelos sobre un corpus real de cada vertical midiendo
 * recall@k: para cada pregunta, ¿está su fragmento correcto entre los k más
 * cercanos por coseno?
 *
 * Entrada: un JSON por vertical con la forma
 *   { "corpus": [{ "id": "c1", "text": "..." }, ...],
 *     "questions": [{ "text": "...", "expected": "c1" }, ...] }
 *
 * Uso:
 *   VOYAGE_API_KEY=... OPENAI_API_KEY=... \
 *   node apps/api/scripts/bench-embeddings.mjs bench-elearning.json bench-residencias.json
 *
 * Sin claves de un proveedor, se salta ese proveedor. Los candidatos y sus
 * dimensiones se editan abajo (CANDIDATES).
 */
const CANDIDATES = [
  { provider: 'voyage', model: 'voyage-3.5-lite', dim: 1024, env: 'VOYAGE_API_KEY', url: 'https://api.voyageai.com/v1/embeddings' },
  { provider: 'voyage', model: 'voyage-3.5', dim: 1024, env: 'VOYAGE_API_KEY', url: 'https://api.voyageai.com/v1/embeddings' },
  { provider: 'openai', model: 'text-embedding-3-small', dim: 1536, env: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/embeddings' },
];
const K = Number(process.env.BENCH_K ?? 5);

async function embed(cand, texts) {
  const key = process.env[cand.env];
  const body = cand.provider === 'voyage'
    ? { model: cand.model, input: texts, output_dimension: cand.dim }
    : { model: cand.model, input: texts, dimensions: cand.dim };
  const res = await fetch(cand.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${cand.model}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()).data;
  return data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

const cos = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const files = process.argv.slice(2);
if (!files.length) {
  console.error('uso: node bench-embeddings.mjs <dataset.json> [...más datasets]');
  process.exit(1);
}

for (const file of files) {
  const { corpus, questions } = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(file, 'utf8')));
  console.log(`\n=== ${file} · ${corpus.length} fragmentos · ${questions.length} preguntas · recall@${K} ===`);
  for (const cand of CANDIDATES) {
    if (!process.env[cand.env]) { console.log(`  ${cand.model}: SALTADO (falta ${cand.env})`); continue; }
    const t0 = Date.now();
    const corpusVecs = await embed(cand, corpus.map((c) => c.text));
    const questionVecs = await embed(cand, questions.map((q) => q.text));
    let hits = 0;
    for (let qi = 0; qi < questions.length; qi++) {
      const ranked = corpus
        .map((c, ci) => ({ id: c.id, score: cos(questionVecs[qi], corpusVecs[ci]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, K);
      if (ranked.some((r) => r.id === questions[qi].expected)) hits++;
    }
    const recall = ((hits / questions.length) * 100).toFixed(1);
    console.log(`  ${cand.model.padEnd(26)} recall@${K}=${recall}%  (${Date.now() - t0}ms, dim=${cand.dim})`);
  }
}
