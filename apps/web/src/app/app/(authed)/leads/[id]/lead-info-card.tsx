'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';

interface LeadInfo {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: string;
  ownerId: string | null;
  contactedAt: string | null;
  qualifiedAt: string | null;
  createdAt: string;
}

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'] as const;

export function LeadInfoCard({ lead }: { lead: LeadInfo }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: lead.name,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    company: lead.company ?? '',
    source: lead.source ?? '',
    status: lead.status,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/leads/${lead.id}`, {
        method: 'PATCH',
        json: {
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          company: form.company || undefined,
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
          <Field label="Empresa">
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
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
        <Row label="Email" value={lead.email ?? '—'} />
        <Row label="Teléfono" value={lead.phone ?? '—'} />
        <Row label="Empresa" value={lead.company ?? '—'} />
        <Row label="Fuente" value={lead.source ?? '—'} />
        <Row label="Creado" value={new Date(lead.createdAt).toLocaleString('es-ES')} />
        {lead.contactedAt && (
          <Row label="Contactado" value={new Date(lead.contactedAt).toLocaleString('es-ES')} />
        )}
        {lead.qualifiedAt && (
          <Row label="Cualificado" value={new Date(lead.qualifiedAt).toLocaleString('es-ES')} />
        )}
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
