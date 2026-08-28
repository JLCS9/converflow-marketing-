import type { UiLocale } from '@converflow/shared';

/**
 * Carga perezosa del diccionario. Import dinámico para que el bundle de un
 * usuario en español no arrastre el francés y el inglés.
 */
export async function messagesFor(locale: UiLocale): Promise<Record<string, unknown>> {
  switch (locale) {
    case 'en':
      return (await import('./messages/en')).default;
    case 'fr':
      return (await import('./messages/fr')).default;
    default:
      return (await import('./messages/es')).default;
  }
}
