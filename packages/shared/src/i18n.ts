/**
 * Idiomas de la interfaz.
 *
 * Compartido entre API y web para que el conjunto de valores válidos sea uno
 * solo: la API valida contra él y la web construye el selector con él.
 */
export const UI_LOCALES = ['es', 'en', 'fr'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_LOCALE: UiLocale = 'es';

/** Nombre de cada idioma en su propio idioma, que es como se listan. */
export const LOCALE_NAMES: Record<UiLocale, string> = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
};

/** Normaliza cualquier entrada (cabecera, cookie, BD) a un idioma soportado. */
export function resolveLocale(raw: unknown): UiLocale {
  const s = String(raw ?? '').trim().toLowerCase().slice(0, 2);
  return (UI_LOCALES as readonly string[]).includes(s) ? (s as UiLocale) : DEFAULT_LOCALE;
}
