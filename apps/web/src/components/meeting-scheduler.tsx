'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass, Input } from '@/components/ui/primitives';

interface ProposedSlot {
  startIso: string;
  endIso: string;
  localLabel: string;
  reason: string;
}

interface ProposeResponse {
  connected: boolean;
  slots: ProposedSlot[];
  title?: string;
  agenda?: string;
  message?: string;
  durationMin: number;
}

interface ScheduleResponse {
  event: { id: string; htmlLink: string };
  task: { id: string } | null;
}

export function MeetingScheduler({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  const [durationMin, setDurationMin] = useState(30);
  const [proposal, setProposal] = useState<ProposeResponse | null>(null);
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [selected, setSelected] = useState<number>(0);
  const [scheduled, setScheduled] = useState<ScheduleResponse | null>(null);

  function propose() {
    setError(null);
    setNotConnected(false);
    setScheduled(null);
    startTransition(async () => {
      try {
        const res = await apiFetch<ProposeResponse>('/meetings/propose', {
          method: 'POST',
          json: { leadId, durationMin },
        });
        setProposal(res);
        setTitle(res.title ?? `Reunión con lead`);
        setAgenda(res.agenda ?? '');
        setSelected(0);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 503)) {
          setNotConnected(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Error inesperado');
        }
      }
    });
  }

  function schedule() {
    if (!proposal || !proposal.slots[selected]) return;
    setError(null);
    const slot = proposal.slots[selected];
    startTransition(async () => {
      try {
        const res = await apiFetch<ScheduleResponse>('/meetings/schedule', {
          method: 'POST',
          json: {
            leadId,
            startIso: slot.startIso,
            durationMin: proposal.durationMin,
            title: title.trim() || 'Reunión',
            description: agenda.trim() || undefined,
          },
        });
        setScheduled(res);
        setProposal(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    });
  }

  if (notConnected) {
    return (
      <p className="text-sm text-ink-500">
        Conecta tu Google Calendar en{' '}
        <Link href="/app/settings" className="text-primary-700 hover:underline">
          Ajustes
        </Link>{' '}
        para proponer y agendar reuniones con IA.
      </p>
    );
  }

  if (scheduled) {
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-700">
          ✓ Reunión creada en tu Google Calendar
          {scheduled.task && ' · tarea de seguimiento añadida'}.
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={scheduled.event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('secondary')}
          >
            Abrir en Google Calendar →
          </a>
          <button
            type="button"
            className={buttonClass('ghost')}
            onClick={() => {
              setScheduled(null);
              propose();
            }}
          >
            Agendar otra
          </button>
        </div>
      </div>
    );
  }

  if (proposal) {
    if (proposal.slots.length === 0) {
      return (
        <div className="space-y-3 text-sm">
          <p className="text-ink-600">{proposal.message ?? 'No hay huecos disponibles.'}</p>
          <button type="button" className={buttonClass('secondary')} onClick={propose}>
            Reintentar
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-4 text-sm">
        <div>
          <label className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Título
          </label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        {agenda && (
          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-ink-500">
              Agenda propuesta
            </label>
            <p className="mt-1 text-ink-700">{agenda}</p>
          </div>
        )}
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Huecos propuestos por la IA ({proposal.durationMin} min)
          </div>
          {proposal.slots.map((slot, i) => (
            <label
              key={slot.startIso}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                selected === i ? 'border-primary-500 bg-primary-50' : 'border-ink-200'
              }`}
            >
              <input
                type="radio"
                name="slot"
                checked={selected === i}
                onChange={() => setSelected(i)}
                className="mt-1"
              />
              <div>
                <div className="font-medium capitalize text-ink-900">{slot.localLabel}</div>
                {slot.reason && <div className="mt-0.5 text-xs text-ink-500">{slot.reason}</div>}
              </div>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            className={buttonClass('primary')}
            onClick={schedule}
          >
            {pending ? 'Agendando…' : 'Agendar reunión'}
          </button>
          <button
            type="button"
            disabled={pending}
            className={buttonClass('ghost')}
            onClick={() => setProposal(null)}
          >
            Cancelar
          </button>
        </div>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Duración
          </label>
          <select
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="mt-1 block rounded-md border-ink-300 text-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
          </select>
        </div>
        <button
          type="button"
          disabled={pending}
          className={buttonClass('primary')}
          onClick={propose}
        >
          {pending ? 'Consultando tu agenda…' : '📅 Proponer horarios con IA'}
        </button>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
