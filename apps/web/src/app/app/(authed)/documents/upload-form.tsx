'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { Field, Input, buttonClass } from '@/components/ui/primitives';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export function UploadForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const file = data.get('file') as File | null;
        if (!file || file.size === 0) {
          setError('Selecciona un fichero');
          return;
        }
        setError(null);
        setProgress(`Subiendo ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)…`);

        startTransition(async () => {
          try {
            // Build a clean FormData — only the fields the backend expects
            const fd = new FormData();
            fd.append('file', file);
            const clientId = (data.get('clientId') as string | null)?.trim();
            const opportunityId = (data.get('opportunityId') as string | null)?.trim();
            if (clientId) fd.append('clientId', clientId);
            if (opportunityId) fd.append('opportunityId', opportunityId);

            const res = await fetch(`${BASE}/documents/upload`, {
              method: 'POST',
              credentials: 'include',
              body: fd,
            });
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              let msg = res.statusText;
              try {
                const json = JSON.parse(text);
                msg = json?.error?.message ?? msg;
              } catch {
                /* keep statusText */
              }
              throw new ApiError(res.status, msg, text);
            }
            setProgress('✓ Subido');
            form.reset();
            router.refresh();
            setTimeout(() => setProgress(null), 2000);
          } catch (err) {
            setProgress(null);
            setError(err instanceof ApiError ? err.message : 'Error al subir');
          }
        });
      }}
    >
      <Field label="Fichero" required>
        <input
          name="file"
          type="file"
          required
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-white hover:file:bg-ink-700"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente ID (opcional)">
          <Input name="clientId" type="text" className="font-mono text-xs" />
        </Field>
        <Field label="Oportunidad ID (opcional)">
          <Input name="opportunityId" type="text" className="font-mono text-xs" />
        </Field>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {progress && !error && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {progress}
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" className={buttonClass('primary')} disabled={pending}>
          {pending ? 'Subiendo…' : 'Subir'}
        </button>
      </div>
    </form>
  );
}
