'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';

export function CreateTaskForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const dueAtStr = String(data.get('dueAt') ?? '').trim();
          const payload = {
            title: String(data.get('title') ?? '').trim(),
            description: String(data.get('description') ?? '').trim() || undefined,
            type: (String(data.get('type') ?? 'OTHER')) as never,
            status: (String(data.get('status') ?? 'PENDING')) as never,
            priority: (String(data.get('priority') ?? 'MEDIUM')) as never,
            dueAt: dueAtStr || undefined,
            leadId: String(data.get('leadId') ?? '').trim() || undefined,
            clientId: String(data.get('clientId') ?? '').trim() || undefined,
            opportunityId: String(data.get('opportunityId') ?? '').trim() || undefined,
          };
          setError(null);
          startTransition(async () => {
            try {
              await apiFetch('/tasks', { method: 'POST', json: payload });
              router.push('/app/tasks');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        <Field label="Título" required>
          <Input name="title" type="text" required minLength={1} maxLength={200} />
        </Field>
        <Field label="Descripción">
          <Textarea name="description" rows={3} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Tipo">
            <Select name="type" defaultValue="OTHER">
              <option value="CALL">Llamada</option>
              <option value="EMAIL">Email</option>
              <option value="MEETING">Reunión</option>
              <option value="FOLLOW_UP">Seguimiento</option>
              <option value="OTHER">Otro</option>
            </Select>
          </Field>
          <Field label="Prioridad">
            <Select name="priority" defaultValue="MEDIUM">
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </Select>
          </Field>
          <Field label="Vence">
            <Input name="dueAt" type="datetime-local" />
          </Field>
        </div>

        <hr className="border-ink-100" />
        <p className="text-xs text-ink-500">Opcional: vincula la tarea a un lead, cliente u oportunidad (pega su ID).</p>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Lead ID"><Input name="leadId" type="text" className="font-mono text-xs" /></Field>
          <Field label="Cliente ID"><Input name="clientId" type="text" className="font-mono text-xs" /></Field>
          <Field label="Oportunidad ID"><Input name="opportunityId" type="text" className="font-mono text-xs" /></Field>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push('/app/tasks')} className={buttonClass('secondary')} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Creando…' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Card>
  );
}
