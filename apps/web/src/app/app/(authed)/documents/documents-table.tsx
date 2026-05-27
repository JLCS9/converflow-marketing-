'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';

interface DocRow {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  client: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsTable({ docs }: { docs: DocRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [_, startTransition] = useTransition();

  return (
    <>
      {error && <div className="border-b border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <table className="w-full text-sm">
        <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
          <tr>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Tamaño</th>
            <th className="px-4 py-3">Vinculado</th>
            <th className="px-4 py-3">Subido</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
              <td className="px-4 py-3 font-medium">{d.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-ink-500">{d.mimeType}</td>
              <td className="px-4 py-3 font-mono text-xs">{formatBytes(d.sizeBytes)}</td>
              <td className="px-4 py-3 text-xs">
                {d.client && (
                  <Link href={`/app/clients/${d.client.id}`} className="text-primary-700 hover:underline">
                    {d.client.name}
                  </Link>
                )}
                {d.opportunity && (
                  <Link href={`/app/opportunities/${d.opportunity.id}`} className="text-primary-700 hover:underline">
                    {d.opportunity.name}
                  </Link>
                )}
                {!d.client && !d.opportunity && '—'}
              </td>
              <td className="px-4 py-3 text-xs text-ink-500">
                {new Date(d.createdAt).toLocaleString('es-ES')}
              </td>
              <td className="px-4 py-3 text-right space-x-3">
                <button
                  type="button"
                  disabled={pendingId === d.id}
                  onClick={() => {
                    setPendingId(d.id);
                    setError(null);
                    startTransition(async () => {
                      try {
                        const res = await apiFetch<{ url: string }>(`/documents/${d.id}/download`);
                        window.open(res.url, '_blank', 'noopener');
                      } catch (err) {
                        setError(err instanceof ApiError ? err.message : 'Error al firmar descarga');
                      } finally {
                        setPendingId(null);
                      }
                    });
                  }}
                  className="text-xs text-primary-700 hover:underline disabled:opacity-60"
                >
                  Descargar
                </button>
                <button
                  type="button"
                  disabled={pendingId === d.id}
                  onClick={() => {
                    if (!confirm(`¿Eliminar ${d.name}?`)) return;
                    setPendingId(d.id);
                    setError(null);
                    startTransition(async () => {
                      try {
                        await apiFetch(`/documents/${d.id}`, { method: 'DELETE' });
                        router.refresh();
                      } catch (err) {
                        setError(err instanceof ApiError ? err.message : 'Error al eliminar');
                      } finally {
                        setPendingId(null);
                      }
                    });
                  }}
                  className="text-xs text-red-600 hover:underline disabled:opacity-60"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
