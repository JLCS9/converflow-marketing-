'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import { LEAD_STATUS_OPTIONS } from '@/lib/labels';

interface LeadInfo {
  id: string;
  name: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  /** Legacy field — no longer surfaced in the create/edit form; shown only when populated. */
  company: string | null;
  source: string | null;
  status: string;
  ownerId: string | null;
  contactedAt: string | null;
  qualifiedAt: string | null;
  createdAt: string;
}

export function LeadInfoCard({ lead }: { lead: LeadInfo }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: lead.name,
    lastName: lead.lastName ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
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
          lastName: form.lastName || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          source: form.source || undefined,
          status: form.status,
        },
      });
      toast.success('Cambios guardados');
      setEditing(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo guardar';
      setErr(msg);
      toast.error(msg);
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Apellido">
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
          </div>
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
              {LEAD_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
        {lead.lastName && <Row label="Apellido" value={lead.lastName} />}
        <Row label="Email" value={lead.email ?? '—'} />
        <Row label="Teléfono" value={lead.phone ?? '—'} />
        {lead.company && <Row label="Empresa" value={lead.company} />}
        <Row label="Fuente" value={lead.source ?? '—'} />
        <Row label="Creado" value={new Date(lead.createdAt).toLocaleString('es-ES')} />
        {lead.contactedAt && (
          <Row label="Contactado" value={new Date(lead.contactedAt).toLocaleString('es-ES')} />
        )}
        {lead.qualifiedAt && (
          <Row label="Cliente desde" value={new Date(lead.qualifiedAt).toLocaleString('es-ES')} />
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
