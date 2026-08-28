'use client';

/**
 * Selector de idioma de la interfaz.
 *
 * Es por usuario, no por cuenta: en un equipo mixto cada persona trabaja en el
 * suyo dentro del mismo tenant. La API guarda `User.locale` y escribe la cookie
 * `cf_locale`, que es de donde lo lee el servidor de Next en cada render.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Languages, Check, AlertTriangle } from 'lucide-react';
import { UI_LOCALES, LOCALE_NAMES, type UiLocale } from '@converflow/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/primitives';

export function LanguageCard({ current }: { current: UiLocale }) {
  const t = useTranslations('profile');
  const router = useRouter();
  const [locale, setLocale] = useState<UiLocale>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: UiLocale) {
    if (next === locale || pending) return;
    setError(null);
    const previous = locale;
    setLocale(next);
    startTransition(async () => {
      try {
        await apiFetch('/me/locale', { method: 'PATCH', json: { locale: next } });
        // La cookie la escribe la API en esta misma respuesta; hace falta
        // recargar desde el servidor para que los server components se
        // re-rendericen con el diccionario nuevo.
        router.refresh();
      } catch (err) {
        setLocale(previous);
        setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el idioma');
      }
    });
  }

  return (
    <Card>
      <div className="space-y-3">
        <div>
          <h2 className="inline-flex items-center gap-1.5 text-base font-semibold text-ink-900">
            <Languages size={16} /> {t('language')}
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">{t('languageHelp')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {UI_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => choose(l)}
              disabled={pending}
              aria-pressed={locale === l}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                locale === l
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 text-ink-700 hover:border-ink-400'
              }`}
            >
              {locale === l && <Check size={13} />}
              {LOCALE_NAMES[l]}
            </button>
          ))}
        </div>

        {error && (
          <p className="inline-flex items-center gap-1 text-xs text-red-700">
            <AlertTriangle size={12} /> {error}
          </p>
        )}
      </div>
    </Card>
  );
}
