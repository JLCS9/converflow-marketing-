'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';

export function TemplateActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function del() {
    if (!window.confirm('¿Eliminar esta plantilla?')) return;
    startTransition(async () => {
      try {
        await apiFetch(`/email-templates/${id}`, { method: 'DELETE' });
        router.refresh();
      } catch {
        /* ignore */
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-3">
      <Link href={`/app/templates/${id}`} className="text-xs text-primary-700 hover:underline">
        Editar
      </Link>
      <button
        type="button"
        onClick={del}
        disabled={pending}
        className={buttonClass('ghost', 'px-2 py-1 text-xs text-red-600')}
      >
        Eliminar
      </button>
    </span>
  );
}
