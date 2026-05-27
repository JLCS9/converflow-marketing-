'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, buttonClass } from '@/components/ui/primitives';

type ParsedLead = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
};

function parseCsv(text: string): ParsedLead[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headerLine = lines[0] ?? '';
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
  const out: ParsedLead[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? '';
    });
    if (!row.name) continue;
    out.push({
      name: row.name,
      email: row.email || undefined,
      phone: row.phone || undefined,
      company: row.company || undefined,
      source: row.source || 'import',
    });
  }
  return out;
}

export function ImportLeadsForm() {
  const router = useRouter();
  const [preview, setPreview] = useState<ParsedLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [imported, setImported] = useState<number | null>(null);

  return (
    <Card>
      <div className="space-y-4">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const parsed = parseCsv(text);
              setPreview(parsed);
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Error al parsear');
            }
          }}
          className="block text-sm"
        />

        {preview.length > 0 && (
          <div>
            <p className="text-sm text-ink-700">
              <strong>{preview.length}</strong> leads detectados. Vista previa de los 5 primeros:
            </p>
            <pre className="mt-2 max-h-48 overflow-auto rounded border border-ink-200 bg-ink-100/30 p-3 text-xs">
              {JSON.stringify(preview.slice(0, 5), null, 2)}
            </pre>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {imported != null && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            ✓ {imported} leads importados.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/leads')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending || preview.length === 0}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const res = await apiFetch<{ imported: number }>('/leads/import', {
                    method: 'POST',
                    json: { leads: preview },
                  });
                  setImported(res.imported);
                  setPreview([]);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Error en import');
                }
              });
            }}
            className={buttonClass('primary')}
          >
            {pending ? 'Importando…' : `Importar ${preview.length} leads`}
          </button>
        </div>
      </div>
    </Card>
  );
}
