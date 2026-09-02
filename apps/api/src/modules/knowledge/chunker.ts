/**
 * Troceado de texto para la memoria (F2). Sencillo a conciencia: párrafos
 * agrupados hasta ~1500 caracteres con solape de un párrafo — suficiente
 * para FAQs, fichas y descripciones de catálogo del piloto. Nada de
 * dependencias ni tokenizadores: si algún corpus lo exige, se sofistica.
 */
const MAX_CHARS = 1500;

export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;

  const flush = () => {
    if (current.length) chunks.push(current.join('\n\n'));
  };

  for (const p of paragraphs) {
    // Párrafo gigante: se corta por frases.
    if (p.length > MAX_CHARS) {
      flush();
      current = [];
      size = 0;
      let buf = '';
      for (const sentence of p.split(/(?<=[.!?…])\s+/)) {
        if (buf.length + sentence.length > MAX_CHARS && buf) {
          chunks.push(buf.trim());
          buf = '';
        }
        buf += `${sentence} `;
      }
      if (buf.trim()) chunks.push(buf.trim());
      continue;
    }
    if (size + p.length > MAX_CHARS && current.length) {
      flush();
      // Solape: el último párrafo del chunk anterior abre el siguiente.
      current = [current[current.length - 1]!];
      size = current[0]!.length;
    }
    current.push(p);
    size += p.length;
  }
  flush();
  return chunks;
}
