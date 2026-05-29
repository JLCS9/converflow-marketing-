'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';

export function CreateBotForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState('WEBCHAT');
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const payload = {
            name: String(data.get('name') ?? '').trim(),
            channel: String(data.get('channel') ?? 'WEBCHAT'),
            phoneNumber: String(data.get('phoneNumber') ?? '').trim() || undefined,
          };
          setError(null);
          startTransition(async () => {
            try {
              await apiFetch('/bots', { method: 'POST', json: payload });
              router.push('/app/bots');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        <Field label="Nombre" required help="Ej. 'Ventas WhatsApp principal' o 'Soporte web'.">
          <Input name="name" type="text" required minLength={2} maxLength={60} />
        </Field>
        <Field label="Canal" required>
          <Select name="channel" defaultValue="WEBCHAT" onChange={(e) => setChannel(e.target.value)}>
            <option value="WEBCHAT">Web Chat (embebido en tu web)</option>
            <option value="WHATSAPP">WhatsApp (QR)</option>
            <option value="EMAIL">Email</option>
            <option value="INSTAGRAM">Instagram (próximamente)</option>
            <option value="MESSENGER">Messenger (próximamente)</option>
          </Select>
        </Field>

        {channel === 'EMAIL' && (
          <Field
            label="Dirección de email entrante"
            required
            help="La dirección donde recibes los emails de clientes (y desde la que se responde). Configura el reenvío/webhook de tu proveedor hacia ella."
          >
            <Input name="phoneNumber" type="email" placeholder="ventas@tuempresa.com" />
          </Field>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/bots')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Creando…' : 'Crear bot'}
          </button>
        </div>
      </form>
    </Card>
  );
}
