'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/primitives';

export interface Alert {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string | null;
  resourceType: string;
  resourceId: string;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

const typeIcon: Record<string, string> = {
  LEAD_STALE: '🕒',
  OPPORTUNITY_DUE: '⏰',
  TASK_OVERDUE: '⚠️',
  HIGH_SCORE_LEAD: '⭐',
  CLIENT_INACTIVITY: '💤',
  OTHER: '🔔',
};

const severityBadge: Record<Alert['severity'], { color: 'blue' | 'yellow' | 'red'; label: string }> = {
  INFO: { color: 'blue', label: 'Info' },
  WARNING: { color: 'yellow', label: 'Aviso' },
  CRITICAL: { color: 'red', label: 'Crítico' },
};

function resourceHref(resourceType: string, resourceId: string): string | null {
  switch (resourceType) {
    case 'lead':
      return `/app/leads/${resourceId}`;
    case 'opportunity':
      return `/app/opportunities/${resourceId}`;
    case 'task':
      return '/app/tasks';
    default:
      return null;
  }
}

export function AlertItem({ alert }: { alert: Alert }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const unread = !alert.readAt;
  const sev = severityBadge[alert.severity];
  const href = resourceHref(alert.resourceType, alert.resourceId);

  async function act(path: string) {
    setBusy(true);
    try {
      await apiFetch(path, { method: 'POST' });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`flex items-start gap-3 rounded-lg border p-4 ${
        unread ? 'border-ink-200 bg-white' : 'border-ink-100 bg-ink-100/30'
      }`}
    >
      <span className="mt-0.5 text-xl leading-none" aria-hidden>
        {typeIcon[alert.type] ?? '🔔'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={sev.color}>{sev.label}</Badge>
          <span className={`text-sm ${unread ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
            {alert.title}
          </span>
          {unread && <span className="h-2 w-2 rounded-full bg-primary-500" aria-label="No leída" />}
        </div>
        {alert.description && <p className="mt-1 text-sm text-ink-600">{alert.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {href && (
            <Link href={href} className="text-primary-700 hover:underline">
              Ver detalle →
            </Link>
          )}
          {unread && (
            <button
              type="button"
              onClick={() => act(`/alerts/${alert.id}/read`)}
              disabled={busy || pending}
              className="text-ink-500 hover:text-ink-900 disabled:opacity-50"
            >
              Marcar leída
            </button>
          )}
          <button
            type="button"
            onClick={() => act(`/alerts/${alert.id}/dismiss`)}
            disabled={busy || pending}
            className="text-ink-500 hover:text-red-600 disabled:opacity-50"
          >
            Descartar
          </button>
          <span className="ml-auto font-mono text-ink-400">
            {new Date(alert.createdAt).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>
      </div>
    </li>
  );
}

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      await apiFetch('/alerts/read-all', { method: 'POST' });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={markAll}
      disabled={disabled || busy || pending}
      className="text-sm text-primary-700 hover:underline disabled:opacity-50"
    >
      Marcar todas como leídas
    </button>
  );
}
