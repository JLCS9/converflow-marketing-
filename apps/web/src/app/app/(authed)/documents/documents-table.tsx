'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';

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
  const { confirm, toast } = useFeedback();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <>

      <table className="w-full text-sm">
        <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
          <tr>
            <th className="px-4 py-3">Nombre</th>
            <th className="hidden px-4 py-3 lg:table-cell">Tipo</th>
            <th className="hidden px-4 py-3 md:table-cell">Tamaño</th>
            <th className="hidden px-4 py-3 md:table-cell">Vinculado</th>
            <th className="hidden px-4 py-3 lg:table-cell">Subido</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
              <td className="px-4 py-3 font-medium">
                {d.name}
                <div className="mt-0.5 text-xs text-ink-500 md:hidden">
                  {formatBytes(d.sizeBytes)} · {new Date(d.createdAt).toLocaleDateString('es-ES')}
                </div>
              </td>
              <td className="hidden px-4 py-3 font-mono text-xs text-ink-500 lg:table-cell">
                {d.mimeType}
              </td>
              <td className="hidden px-4 py-3 font-mono text-xs md:table-cell">
                {formatBytes(d.sizeBytes)}
              </td>
              <td className="hidden px-4 py-3 text-xs md:table-cell">
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
              <td className="hidden px-4 py-3 text-xs text-ink-500 lg:table-cell">
                {new Date(d.createdAt).toLocaleString('es-ES')}
              </td>
              <td className="px-4 py-3 text-right space-x-3">
                <button
                  type="button"
                  disabled={pendingId === d.id}
                  onClick={() => {
                    setPendingId(d.id);
                    startTransition(async () => {
                      try {
                        const res = await apiFetch<{ url: string }>(`/documents/${d.id}/download`);
                        window.open(res.url, '_blank', 'noopener');
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar');
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
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Eliminar ${d.name}`,
                      description: 'El archivo y su enlace se borran. No se puede deshacer.',
                      danger: true,
                    });
                    if (!ok) return;
                    setPendingId(d.id);
                    startTransition(async () => {
                      try {
                        await apiFetch(`/documents/${d.id}`, { method: 'DELETE' });
                        toast.success('Documento eliminado');
                        router.refresh();
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar');
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
