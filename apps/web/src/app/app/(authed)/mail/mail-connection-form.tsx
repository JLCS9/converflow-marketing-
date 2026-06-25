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
  secure: boolean;
  visibility: string;
}

const PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; secure: boolean; note?: string }> = {
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465, secure: true, note: 'Gmail/Workspace: activa 2FA y usa una "Contraseña de aplicación" (16 caracteres), no tu contraseña normal.' },
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587, secure: false, note: 'Outlook/365: puerto SMTP 587 (STARTTLS).' },
  ionos: { imapHost: 'imap.ionos.es', imapPort: 993, smtpHost: 'smtp.ionos.es', smtpPort: 465, secure: true },
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
  const [secure, setSecure] = useState(c?.secure ?? true);
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
    setSecure(p.secure);
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
          secure,
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

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
          Conexión segura (SSL/TLS) — desmárcalo solo para SMTP 587 (STARTTLS)
        </label>

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
