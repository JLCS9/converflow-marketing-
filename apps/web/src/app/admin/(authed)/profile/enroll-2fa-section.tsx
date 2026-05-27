'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';

interface EnrollResponse {
  uri: string;
  qrPng: string;
}

export function Enroll2faSection({ totpEnabled }: { totpEnabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enroll, setEnroll] = useState<EnrollResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (success) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
        ✓ 2FA activado. La próxima vez que inicies sesión te pedirá el código de tu app.
      </div>
    );
  }

  if (!enroll) {
    return (
      <button
        type="button"
        className={buttonClass(totpEnabled ? 'secondary' : 'primary')}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const res = await apiFetch<EnrollResponse>('/admin/auth/2fa/enroll', {
                method: 'POST',
              });
              setEnroll(res);
            } catch (err) {
              setVerifyError(err instanceof ApiError ? err.message : 'Error');
            }
          })
        }
      >
        {pending ? 'Generando…' : totpEnabled ? 'Rotar secret' : 'Configurar 2FA'}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-700">
        Escanea el QR con tu app autenticadora.
      </p>
      <div className="flex flex-wrap items-start gap-6">
        {/* QR comes from server as a data: URI — next/image can't handle that */}
        <img
          src={enroll.qrPng}
          alt="QR para enrolar TOTP"
          className="h-48 w-48 rounded border border-ink-200 bg-white p-2"
        />
        <div className="min-w-0 flex-1 space-y-2 text-xs">
          <div>
            <div className="text-ink-500">URI (otpauth)</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 select-all break-all rounded border border-ink-200 bg-ink-100/40 px-2 py-1 font-mono">
                {enroll.uri}
              </code>
              <CopyButton value={enroll.uri} />
            </div>
          </div>
          <p className="text-ink-500">
            Si no puedes escanear el QR, copia la URI completa en tu app autenticadora.
          </p>
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const code = String(data.get('code') ?? '').trim();
          setVerifyError(null);
          startTransition(async () => {
            try {
              await apiFetch('/admin/auth/2fa/verify', { method: 'POST', json: { code } });
              setSuccess(true);
              router.refresh();
            } catch (err) {
              setVerifyError(err instanceof ApiError ? err.message : 'Código inválido');
            }
          });
        }}
      >
        <Field label="Código de 6 dígitos" required>
          <Input
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            required
            autoFocus
            className="font-mono tracking-widest"
          />
        </Field>
        <button type="submit" className={buttonClass('primary')} disabled={pending}>
          {pending ? 'Verificando…' : 'Activar 2FA'}
        </button>
        <button
          type="button"
          className={buttonClass('ghost')}
          disabled={pending}
          onClick={() => setEnroll(null)}
        >
          Cancelar
        </button>
      </form>

      {verifyError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {verifyError}
        </div>
      )}
    </div>
  );
}
