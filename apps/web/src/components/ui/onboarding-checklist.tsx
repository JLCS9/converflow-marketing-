'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Card } from '@/components/ui/primitives';

export interface OnboardingStep {
  key: string;
  label: string;
  description?: string;
  done: boolean;
  href: string;
  cta?: string;
}

const DISMISS_KEY = 'cf:onboarding:dismissed';

/**
 * Shows a 3-5 step checklist to a fresh tenant. Hides itself completely once
 * all steps are done (the user reached "activation"), or if the user has
 * explicitly dismissed it via the close button (persisted in localStorage).
 */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  const allDone = steps.every((s) => s.done);
  if (dismissed === null) return null; // first paint, don't flash
  if (allDone || dismissed) return null;

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary-200 bg-primary-50/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-wider text-primary-700">
            Empieza por aquí
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            Completa estos pasos para tener tu Converflow funcionando. {doneCount} de {steps.length} hecho.
          </p>
        </div>
        <button
          type="button"
          aria-label="Cerrar guía de inicio"
          className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setDismissed(true);
          }}
        >
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
              s.done
                ? 'border-green-200 bg-green-50/50'
                : 'border-ink-100 bg-white hover:border-primary-300'
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                s.done
                  ? 'bg-green-500 text-white'
                  : 'bg-ink-100 text-ink-500'
              }`}
              aria-hidden
            >
              {s.done ? <Check size={14} strokeWidth={2.5} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink-900">{s.label}</div>
              {s.description && (
                <div className="mt-0.5 text-xs text-ink-500">{s.description}</div>
              )}
            </div>
            {!s.done && (
              <Link
                href={s.href}
                className="shrink-0 text-xs font-medium text-primary-700 hover:underline"
              >
                {s.cta ?? 'Empezar →'}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
