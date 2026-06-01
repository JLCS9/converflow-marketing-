'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

type Mode = 'OFF' | 'SUGGEST' | 'AUTO';

const OPTIONS: Array<{
  value: Mode;
  emoji: string;
  title: string;
  description: string;
}> = [
  {
    value: 'OFF',
    emoji: '⏸️',
    title: 'Apagado',
    description:
      'El bot recibe y registra los mensajes, pero la IA no actúa. Útil para auditar.',
  },
  {
    value: 'SUGGEST',
    emoji: '🟡',
    title: 'Sugerir (human-in-the-loop)',
    description:
      'La IA prepara la respuesta y la deja en la conversación. Una persona la revisa y envía. Recomendado en canales delicados como WhatsApp.',
  },
  {
    value: 'AUTO',
    emoji: '🟢',
    title: 'Responder solo (auto)',
    description:
      'La IA contesta directamente con el aviso de IA pre-pendido en el primer contacto. Recomendado para Web Chat. Pruébalo primero con un canal de test.',
  },
];

export function BotReplyMode({
  botId,
  initialMode,
}: {
  botId: string;
  initialMode: Mode;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);

  async function save(next: Mode) {
    if (next === mode) return;
    setBusy(true);
    const prev = mode;
    setMode(next); // optimistic
    try {
      await apiFetch(`/bots/${botId}`, {
        method: 'PATCH',
        json: { replyMode: next },
      });
      toast.success('Modo guardado');
      router.refresh();
    } catch (e) {
      setMode(prev);
      toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
        Modo de respuesta
      </h2>
      <p className="mt-1 text-xs text-ink-500">
        Decide cómo responde la IA en este canal. Es una propiedad del bot — el mismo
        agente puede ir Sugerir en WhatsApp y Auto en Web Chat.
      </p>
      <div className="mt-4 space-y-2">
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={busy}
              onClick={() => void save(opt.value)}
              className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                active
                  ? 'border-primary-500 bg-primary-50/60'
                  : 'border-ink-100 hover:border-ink-300'
              }`}
            >
              <span className="text-lg" aria-hidden>
                {opt.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-900">{opt.title}</div>
                <div className="mt-0.5 text-xs text-ink-500">{opt.description}</div>
              </div>
              {active && (
                <span className="shrink-0 rounded bg-primary-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  ACTIVO
                </span>
              )}
            </button>
          );
        })}
      </div>
      {busy && <p className="mt-3 text-xs text-ink-500">Guardando…</p>}
    </Card>
  );
}
