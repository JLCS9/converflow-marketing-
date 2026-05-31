'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Textarea, buttonClass } from '@/components/ui/primitives';

interface Note {
  id: string;
  body: string;
  createdAt: string;
}

export function OpportunityNotes({
  opportunityId,
  initial,
}: {
  opportunityId: string;
  initial: Note[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const body = String(data.get('body') ?? '').trim();
          if (!body) return;
          setError(null);
          startTransition(async () => {
            try {
              await apiFetch('/notes', { method: 'POST', json: { body, opportunityId } });
              form.reset();
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error');
            }
          });
        }}
      >
        <Textarea
          name="body"
          rows={3}
          required
          placeholder="Apunta avances, próximos pasos, blockers…"
        />
        <div className="flex justify-end">
          <button type="submit" className={buttonClass('primary', 'text-xs')} disabled={pending}>
            {pending ? 'Guardando…' : 'Añadir nota'}
          </button>
        </div>
      </form>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}
      {initial.length === 0 ? (
        <p className="text-sm text-ink-500">Sin notas en esta oportunidad.</p>
      ) : (
        <ul className="space-y-2">
          {initial.map((n) => (
            <li key={n.id} className="rounded-md border border-ink-100 bg-white p-3">
              <p className="whitespace-pre-wrap text-sm text-ink-900">{n.body}</p>
              <div className="mt-2 text-xs text-ink-500">
                {new Date(n.createdAt).toLocaleString('es-ES')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
