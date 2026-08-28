import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveLocale, UI_LOCALES, LOCALE_NAMES, DEFAULT_LOCALE } from '@converflow/shared';

describe('resolveLocale', () => {
  it('acepta los idiomas soportados', () => {
    expect(resolveLocale('es')).toBe('es');
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('fr')).toBe('fr');
  });

  it('normaliza variantes regionales y mayúsculas', () => {
    // Lo que llega de una cabecera Accept-Language o de Tenant.locale ('es-ES').
    expect(resolveLocale('es-ES')).toBe('es');
    expect(resolveLocale('EN-GB')).toBe('en');
    expect(resolveLocale('  fr_CA ')).toBe('fr');
  });

  it('cae al idioma por defecto ante cualquier cosa rara, sin lanzar', () => {
    for (const raw of [null, undefined, '', 'de', 'klingon', 42, {}, []]) {
      expect(resolveLocale(raw)).toBe(DEFAULT_LOCALE);
    }
  });

  it('cada idioma soportado tiene nombre propio', () => {
    for (const l of UI_LOCALES) expect(LOCALE_NAMES[l]).toBeTruthy();
  });
});

/**
 * Paridad de claves entre diccionarios.
 *
 * Sin esto, una clave que se añade solo al castellano hace que un usuario en
 * inglés vea texto en español sin que nada falle — el fallo más típico de una
 * traducción a medias, y silencioso. Es un test estático sobre los ficheros:
 * no necesita ni base de datos ni navegador.
 */
const MSG_DIR = resolve(process.cwd(), '../web/src/i18n/messages');

/** Claves "a.b.c" de un diccionario, leídas del fuente sin ejecutarlo. */
function keysOf(file: string): string[] {
  const src = readFileSync(resolve(MSG_DIR, file), 'utf8');
  const keys: string[] = [];
  let section = '';
  for (const line of src.split('\n')) {
    const top = /^ {2}(\w+):\s*\{/.exec(line);
    if (top) {
      section = top[1]!;
      continue;
    }
    const leaf = /^ {4}(\w+):/.exec(line);
    if (leaf && section) keys.push(`${section}.${leaf[1]!}`);
  }
  return keys.sort();
}

describe('diccionarios de traducción', () => {
  const reference = keysOf('es.ts');

  it('el castellano es la referencia y tiene contenido', () => {
    expect(reference.length).toBeGreaterThan(20);
    expect(reference).toContain('nav.home');
  });

  it('hay un fichero por cada idioma soportado', () => {
    const files = readdirSync(MSG_DIR).filter((f) => f.endsWith('.ts'));
    for (const l of UI_LOCALES) expect(files).toContain(`${l}.ts`);
  });

  it.each(UI_LOCALES.filter((l) => l !== 'es'))(
    '%s tiene exactamente las mismas claves que el castellano',
    (locale) => {
      const other = keysOf(`${locale}.ts`);
      const missing = reference.filter((k) => !other.includes(k));
      const extra = other.filter((k) => !reference.includes(k));
      expect(missing, `faltan en ${locale}.ts: ${missing.join(', ')}`).toEqual([]);
      expect(extra, `sobran en ${locale}.ts: ${extra.join(', ')}`).toEqual([]);
    },
  );
});
