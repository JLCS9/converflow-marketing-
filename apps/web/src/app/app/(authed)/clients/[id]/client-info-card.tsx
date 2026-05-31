'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';

interface ClientInfo {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nif: string | null;
  address: string | null;
  website: string | null;
  source: string | null;
  status: string;
  createdAt: string;
}

const STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

export function ClientInfoCard({ client }: { client: ClientInfo }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: client.name,
    email: client.email ?? '',
    phone: client.phone ?? '',
    nif: client.nif ?? '',
    address: client.address ?? '',
    website: client.website ?? '',
    source: client.source ?? '',
    status: client.status,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/clients/${client.id}`, {
        method: 'PATCH',
        json: {
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          nif: form.nif || undefined,
          address: form.address || undefined,
          website: form.website || undefined,
          source: form.source || undefined,
          status: form.status,
        },
      });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Información</h2>
          <button type="button" className="text-xs text-ink-500" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Nombre" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="NIF">
            <Input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Teléfono">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Web">
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </Field>
          <Field label="Dirección">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Fuente">
            <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </Field>
          <Field label="Estado">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          {err && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
          )}
          <button
            type="button"
            className={buttonClass('primary', 'text-xs')}
            onClick={save}
            disabled={busy}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Información</h2>
        <button type="button" className="text-xs text-primary-700 hover:underline" onClick={() => setEditing(true)}>
          Editar
        </button>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Email" value={client.email ?? '—'} />
        <Row label="Teléfono" value={client.phone ?? '—'} />
        <Row label="NIF" value={client.nif ?? '—'} />
        <Row label="Web" value={client.website ?? '—'} />
        <Row label="Dirección" value={client.address ?? '—'} />
        <Row label="Fuente" value={client.source ?? '—'} />
        <Row label="Alta" value={new Date(client.createdAt).toLocaleString('es-ES')} />
      </dl>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
