'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';

interface RecentMsg {
  from?: string;
  subject?: string;
  date?: string;
}

export function MailConnectionActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentMsg[] | null>(null);

  async function testSync() {
    setMsg('Conectando…');
    setRecent(null);
    try {
      const r = await apiFetch<{ ok: boolean; recent: RecentMsg[] }>(`/mail/connections/${id}/test-sync`, { method: 'POST' });
      setMsg(`✓ Conexión OK · ${r.recent.length} mensajes recientes`);
      setRecent(r.recent);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof ApiError ? `✗ ${err.message}` : '✗ Error');
    }
  }

  async function testSend() {
    const to = window.prompt('Enviar correo de prueba a:');
    if (!to) return;
    setMsg('Enviando…');
    try {
      await apiFetch(`/mail/connections/${id}/test-send`, { method: 'POST', json: { to } });
      setMsg('✓ Prueba enviada');
      router.refresh();
    } catch (err) {
      setMsg(err instanceof ApiError ? `✗ ${err.message}` : '✗ Error');
    }
  }

  function del() {
    if (!window.confirm('¿Eliminar esta conexión de buzón?')) return;
    startTransition(async () => {
      try {
        await apiFetch(`/mail/connections/${id}`, { method: 'DELETE' });
        router.refresh();
      } catch {
        /* ignore */
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Link href={`/app/mail/${id}/inbox`} className={buttonClass('secondary', 'px-2 py-1 text-xs')}>Bandeja</Link>
        <Link href={`/app/mail/${id}`} className="text-xs text-primary-700 hover:underline">Editar</Link>
        <button type="button" onClick={() => void testSync()} className={buttonClass('ghost', 'px-2 py-1 text-xs')}>Probar sync</button>
        <button type="button" onClick={() => void testSend()} className={buttonClass('ghost', 'px-2 py-1 text-xs')}>Probar envío</button>
        <button type="button" onClick={del} disabled={pending} className={buttonClass('ghost', 'px-2 py-1 text-xs text-red-600')}>Eliminar</button>
      </div>
      {msg && <span className="text-xs text-ink-600">{msg}</span>}
      {recent && recent.length > 0 && (
        <ul className="mt-1 max-w-xs space-y-0.5 text-left text-[11px] text-ink-500">
          {recent.map((m, i) => (
            <li key={i} className="truncate">• {m.subject || '(sin asunto)'} — {m.from}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
