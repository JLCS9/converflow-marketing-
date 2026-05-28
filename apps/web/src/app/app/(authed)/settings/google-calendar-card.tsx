'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, buttonClass } from '@/components/ui/primitives';

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
}

const flashMessage: Record<string, { text: string; ok: boolean }> = {
  connected: { text: 'Google Calendar conectado correctamente.', ok: true },
  error: { text: 'No se pudo completar la conexión con Google. Inténtalo de nuevo.', ok: false },
  denied: { text: 'Cancelaste el permiso de Google Calendar.', ok: false },
};

export function GoogleCalendarCard({
  status,
  flash,
}: {
  status: GoogleStatus;
  flash?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const banner = flash ? flashMessage[flash] : undefined;

  function connect() {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await apiFetch<{ url: string }>('/integrations/google/connect');
        window.location.href = url;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    });
  }

  function disconnect() {
    setError(null);
    startTransition(async () => {
      try {
        await apiFetch('/integrations/google', { method: 'DELETE' });
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    });
  }

  return (
    <Card>
      <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Google Calendar</h2>
      <p className="mt-1 text-xs text-ink-500">
        Conecta tu cuenta de Google para que la IA proponga huecos y cree reuniones en tu
        calendario desde la ficha de un lead.
      </p>

      {banner && (
        <div
          className={`mt-4 rounded-md border p-3 text-sm ${
            banner.ok
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="mt-4">
        {!status.configured ? (
          <p className="text-sm text-ink-500">
            La integración con Google aún no está habilitada en el servidor. Contacta con
            converflow.
          </p>
        ) : status.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="font-medium text-ink-900">Conectado</span>
              </div>
              <div className="mt-1 text-ink-500">
                {status.googleEmail}
                {status.connectedAt && (
                  <> · desde {new Date(status.connectedAt).toLocaleDateString('es-ES')}</>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              className={buttonClass('secondary')}
              onClick={disconnect}
            >
              {pending ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            className={buttonClass('primary')}
            onClick={connect}
          >
            {pending ? 'Redirigiendo…' : 'Conectar Google Calendar'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </Card>
  );
}
