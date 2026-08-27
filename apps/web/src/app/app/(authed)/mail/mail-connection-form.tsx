'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';

export interface MailConnectionData {
  id: string;
  fromAddress: string;
  displayName: string | null;
  signature: string | null;
  imapHost: string | null;
  imapPort: number | null;
  smtpHost: string | null;
  smtpPort: number | null;
  username: string | null;
  smtpSecure: boolean | null;
  imapSecure: boolean | null;
  secure: boolean;
  visibility: string;
}

/**
 * Mirror of the server's `resolveSecure`: implicit TLS on 465/993, STARTTLS or
 * plain on 25/143/587. Keeps the checkbox showing what will actually happen so
 * the user never has to reason about TLS unless they have a weird port.
 */
function deriveSecure(port: number): boolean {
  if (port === 465 || port === 993) return true;
  if (port === 25 || port === 143 || port === 587) return false;
  return true;
}

const PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; note?: string }> = {
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465, note: 'Gmail/Workspace: activa 2FA y usa una "Contraseña de aplicación" (16 caracteres), no tu contraseña normal.' },
  // SMTP 587 (STARTTLS) + IMAP 993 (TLS): los dos transportes NO coinciden, que
  // es justo lo que rompía este preset cuando había un solo flag para ambos.
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587, note: 'Outlook/365: SMTP 587 con STARTTLS e IMAP 993 con TLS. Converflow lo configura solo.' },
  ionos: { imapHost: 'imap.ionos.es', imapPort: 993, smtpHost: 'smtp.ionos.es', smtpPort: 465 },
};

export function MailConnectionForm({ connection }: { connection?: MailConnectionData }) {
  const router = useRouter();
  const c = connection;
  const [fromAddress, setFromAddress] = useState(c?.fromAddress ?? '');
  const [displayName, setDisplayName] = useState(c?.displayName ?? '');
  const [imapHost, setImapHost] = useState(c?.imapHost ?? '');
  const [imapPort, setImapPort] = useState(String(c?.imapPort ?? 993));
  const [smtpHost, setSmtpHost] = useState(c?.smtpHost ?? '');
  const [smtpPort, setSmtpPort] = useState(String(c?.smtpPort ?? 465));
  const [username, setUsername] = useState(c?.username ?? '');
  const [secret, setSecret] = useState('');
  // null = «deriva del puerto». Solo pasa a explícito si el usuario lo fuerza
  // en los ajustes avanzados, para puertos no estándar.
  const [smtpSecure, setSmtpSecure] = useState<boolean | null>(c?.smtpSecure ?? null);
  const [imapSecure, setImapSecure] = useState<boolean | null>(c?.imapSecure ?? null);
  const [showTls, setShowTls] = useState(false);
  const [visibility, setVisibility] = useState(c?.visibility ?? 'SHARED');
  const [signature, setSignature] = useState(c?.signature ?? '');
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyPreset(key: string) {
    const p = PRESETS[key];
    if (!p) {
      setPresetNote(null);
      return;
    }
    setImapHost(p.imapHost);
    setImapPort(String(p.imapPort));
    setSmtpHost(p.smtpHost);
    setSmtpPort(String(p.smtpPort));
    // Los presets usan puertos estándar → dejar que el servidor derive el TLS.
    setSmtpSecure(null);
    setImapSecure(null);
    setPresetNote(p.note ?? null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          driver: 'SMTP_IMAP',
          fromAddress: fromAddress.trim(),
          displayName: displayName.trim() || undefined,
          imapHost: imapHost.trim(),
          imapPort: Number(imapPort) || 993,
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 465,
          username: (username.trim() || fromAddress.trim()),
          // Omitidos = el servidor los deriva del puerto.
          ...(smtpSecure === null ? {} : { smtpSecure }),
          ...(imapSecure === null ? {} : { imapSecure }),
          visibility,
          signature: signature.trim(),
          ...(secret ? { secret } : {}),
        };
        if (c) {
          await apiFetch(`/mail/connections/${c.id}`, { method: 'PATCH', json: payload });
        } else {
          await apiFetch('/mail/connections', { method: 'POST', json: payload });
        }
        router.push('/app/mail/ajustes');
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    });
  }

  const effectiveImapSecure = imapSecure ?? deriveSecure(Number(imapPort) || 993);
  const effectiveSmtpSecure = smtpSecure ?? deriveSecure(Number(smtpPort) || 465);

  return (
    <Card>
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Dirección de correo" required help="El buzón que se conecta (envía y recibe como esta dirección).">
            <Input type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="ventas@tuempresa.com" />
          </Field>
          <Field label="Nombre visible" help="Aparece como remitente.">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ventas · Tu Empresa" />
          </Field>
        </div>

        <Field label="Proveedor (autocompleta servidores)">
          <Select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="">— Elegir preset —</option>
            <option value="gmail">Gmail / Google Workspace</option>
            <option value="outlook">Outlook / Microsoft 365</option>
            <option value="ionos">IONOS</option>
          </Select>
        </Field>
        {presetNote && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{presetNote}</p>}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Servidor IMAP (entrante)" required>
            <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.tuempresa.com" />
          </Field>
          <Field label="Puerto IMAP">
            <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Servidor SMTP (saliente)" required>
            <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.tuempresa.com" />
          </Field>
          <Field label="Puerto SMTP">
            <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Usuario" help="Normalmente tu dirección de correo.">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="(por defecto, tu dirección)" />
          </Field>
          <Field label={c ? 'Contraseña (dejar vacío = no cambiar)' : 'Contraseña / App Password'} required={!c}>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>

        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-ink-600">
              <span className="font-medium text-ink-800">Cifrado:</span>{' '}
              IMAP {effectiveImapSecure ? 'TLS directo' : 'STARTTLS'} (puerto {imapPort || '—'}) ·{' '}
              SMTP {effectiveSmtpSecure ? 'TLS directo' : 'STARTTLS'} (puerto {smtpPort || '—'}).
              {' '}Se ajusta automáticamente al puerto de cada servidor.
            </p>
            <button
              type="button"
              onClick={() => setShowTls((v) => !v)}
              className="shrink-0 text-xs text-primary-700 hover:underline"
            >
              {showTls ? 'Ocultar' : 'Avanzado'}
            </button>
          </div>
          {showTls && (
            <div className="mt-3 space-y-2 border-t border-ink-200 pt-3">
              <p className="text-xs text-ink-500">
                Cámbialo solo si tu proveedor usa puertos no estándar y la verificación falla.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={effectiveImapSecure}
                  onChange={(e) => setImapSecure(e.target.checked)}
                />
                IMAP con TLS directo (implícito)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={effectiveSmtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                />
                SMTP con TLS directo (implícito)
              </label>
            </div>
          )}
        </div>

        <Field label="Visibilidad" help="Compartido: todo el equipo con permiso lo usa. Privado: solo tú.">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="SHARED">Compartido (equipo)</option>
            <option value="PRIVATE">Privado (solo yo)</option>
          </Select>
        </Field>

        <Field label="Firma" help="Se añade automáticamente al redactar o responder desde este buzón.">
          <Textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            rows={4}
            placeholder={'Nombre Apellido\nCargo · Tu Empresa\n+34 600 000 000'}
          />
        </Field>

        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push('/app/mail/ajustes')} className={buttonClass('secondary')} disabled={pending}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            className={buttonClass('primary')}
            disabled={pending || !fromAddress.trim() || !imapHost.trim() || !smtpHost.trim() || (!c && !secret)}
          >
            {pending ? 'Guardando…' : c ? 'Guardar' : 'Conectar buzón'}
          </button>
        </div>
        <p className="text-xs text-ink-400">
          Al guardar, Converflow verifica la conexión. Próximamente: conectar con Google/Microsoft con un clic (OAuth).
        </p>
      </div>
    </Card>
  );
}
