import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker.js';

describe('chunker', () => {
  it('agrupa párrafos hasta el límite con solape de un párrafo', () => {
    const p = (n: number) => `Párrafo ${n}. ${'x'.repeat(600)}`;
    const chunks = chunkText([p(1), p(2), p(3), p(4)].join('\n\n'));
    expect(chunks.length).toBeGreaterThan(1);
    // solape: el primer párrafo del chunk 2 es el último del chunk 1
    const last1 = chunks[0]!.split('\n\n').pop();
    const first2 = chunks[1]!.split('\n\n')[0];
    expect(first2).toBe(last1);
  });

  it('un párrafo gigante se corta por frases sin perder texto', () => {
    const giant = Array.from({ length: 60 }, (_, i) => `Frase número ${i} con contenido útil.`).join(' ');
    const chunks = chunkText(giant);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('Frase número 59');
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1600);
  });

  it('texto corto → un solo fragmento; vacío → ninguno', () => {
    expect(chunkText('Hola.\n\n¿Qué tal?')).toHaveLength(1);
    expect(chunkText('   \n\n  ')).toHaveLength(0);
  });
});
