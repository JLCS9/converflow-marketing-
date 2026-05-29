'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, buttonClass } from '@/components/ui/primitives';

interface Status {
  connected: boolean;
  email: string | null;
  status: string | null;
  lastError: string | null;
}

export function BotEmailConnect({ botId }: { botId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setStatus(await apiFetch<Status>(`/bots/${botId}/email/status`));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  async function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bots/${botId}/email/connect`, {
        method: 'POST',
        json: {
          email: String(f.get('email') ?? '').trim(),
          username: String(f.get('username') ?? '').trim() || String(f.get('email') ?? '').trim(),
          password: String(f.get('password') ?? ''),
          imapHost: String(f.get('imapHost') ?? '').trim(),
          imapPort: Number(f.get('imapPort') ?? 993),
          smtpHost: String(f.get('smtpHost') ?? '').trim(),
          smtpPort: Number(f.get('smtpPort') ?? 465),
        },
      });
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bots/${botId}/email`, { method: 'DELETE' });
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status?.connected) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-green-700">
          ✓ Email conectado: <strong>{status.email}</strong>
          {status.status === 'ERROR' && (
            <span className="text-red-600"> · error de sincronización: {status.lastError}</span>
          )}
        </p>
        <button type="button" disabled={busy} className={buttonClass('secondary')} onClick={disconnect}>
          {busy ? '…' : 'Desconectar'}
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={connect}>
      <p className="text-xs text-ink-500">
        Conecta tu buzón por IMAP/SMTP. Si tu proveedor lo exige (Gmail, Microsoft 365), genera una
        <strong> contraseña de aplicación</strong> y úsala aquí.
      </p>
      <Field label="Email" required>
        <Input name="email" type="email" required placeholder="ventas@tuempresa.com" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Servidor IMAP (entrante)" required>
          <Input name="imapHost" required placeholder="imap.gmail.com" />
        </Field>
        <Field label="Puerto IMAP">
          <Input name="imapPort" type="number" defaultValue={993} />
        </Field>
        <Field label="Servidor SMTP (saliente)" required>
          <Input name="smtpHost" required placeholder="smtp.gmail.com" />
        </Field>
        <Field label="Puerto SMTP">
          <Input name="smtpPort" type="number" defaultValue={465} />
        </Field>
      </div>
      <Field label="Usuario" help="Normalmente tu email. Déjalo vacío para usar el email.">
        <Input name="username" placeholder="(igual que el email)" />
      </Field>
      <Field label="Contraseña / contraseña de aplicación" required>
        <Input name="password" type="password" required />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <button type="submit" disabled={busy} className={buttonClass('primary')}>
        {busy ? 'Verificando…' : 'Conectar email'}
      </button>
    </form>
  );
}
