'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';
import { buttonClass } from '@/components/ui/primitives';

interface RecentMsg {
  from?: string;
  subject?: string;
  date?: string;
}

export function MailConnectionActions({ id }: { id: string }) {
  const router = useRouter();
  const fb = useFeedback();
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentMsg[] | null>(null);

  async function testSync() {
    setBusy(true);
    setRecent(null);
    try {
      const r = await apiFetch<{ ok: boolean; recent: RecentMsg[] }>(`/mail/connections/${id}/test-sync`, { method: 'POST' });
      fb.toast.success(`Conexión OK · ${r.recent.length} mensajes recientes`);
      setRecent(r.recent);
      router.refresh();
    } catch (err) {
      fb.toast.error(err instanceof ApiError ? err.message : 'No se pudo conectar');
    } finally {
      setBusy(false);
    }
  }

  async function testSend() {
    const to = window.prompt('Enviar correo de prueba a:');
    if (!to) return;
    setBusy(true);
    try {
      await apiFetch(`/mail/connections/${id}/test-send`, { method: 'POST', json: { to } });
      fb.toast.success('Prueba enviada');
      router.refresh();
    } catch (err) {
      fb.toast.error(err instanceof ApiError ? err.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    const ok = await fb.confirm({
      title: 'Eliminar buzón',
      description: 'Se desconectará esta cuenta de Converflow. Los correos ya recibidos se conservan.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/mail/connections/${id}`, { method: 'DELETE' });
      fb.toast.success('Buzón eliminado');
      router.refresh();
    } catch {
      fb.toast.error('No se pudo eliminar el buzón');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Link href={`/app/mail/${id}`} className="text-xs text-primary-700 hover:underline">Editar</Link>
        <button type="button" onClick={() => void testSync()} disabled={busy} className={buttonClass('ghost', 'px-2 py-1 text-xs')}>Probar sync</button>
        <button type="button" onClick={() => void testSend()} disabled={busy} className={buttonClass('ghost', 'px-2 py-1 text-xs')}>Probar envío</button>
        <button type="button" onClick={() => void del()} disabled={busy} className={buttonClass('ghost', 'px-2 py-1 text-xs text-red-600')}>Eliminar</button>
      </div>
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
