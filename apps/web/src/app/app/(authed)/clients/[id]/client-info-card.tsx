'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import { useLabelMaps } from '@/lib/use-labels';

interface ClientInfo {
  id: string;
  name: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  createdAt: string;
}

const STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

export function ClientInfoCard({ client }: { client: ClientInfo }) {
  const tf = useTranslations('crmForms');
  const tToasts = useTranslations('toasts');
  const { CLIENT_STATUS } = useLabelMaps();
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [form, setForm] = useState({
    name: client.name,
    lastName: client.lastName ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
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
          lastName: form.lastName || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          source: form.source || undefined,
          status: form.status,
        },
      });
      toast.success(tToasts('saved'));
      setEditing(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : tf('saveError');
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
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{tf('infoTitle')}</h2>
          <button type="button" className="text-xs text-ink-500" onClick={() => setEditing(false)}>
            {tf('cancel')}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tf('firstName')} required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={tf('lastName')}>
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
          </div>
          <Field label={tf('email')}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label={tf('phone')}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={tf('source')}>
            <Input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder={tf('sourcePlaceholder')}
            />
          </Field>
          <Field label={tf('status')}>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS[s]}
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
            {busy ? tf('saving') : tf('save')}
          </button>
        </div>
      </Card>
    );
  }

  async function remove() {
    const fullName = [client.name, client.lastName].filter(Boolean).join(' ').trim();
    const ok = await confirm({
      title: fullName
        ? tf('deleteTitleNamed', { name: fullName })
        : tf('deleteTitleGeneric'),
      description: (
        <div className="space-y-3">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <strong>{tf('deleteIrreversibleTitle')}</strong> {tf('deleteIrreversibleBody')}
          </div>
          <p>{tf('deleteIntro')}</p>
          <ul className="ml-4 list-disc space-y-1 text-xs text-ink-700">
            <li>{tf('deleteIdentity')}</li>
            <li>{tf('deleteCustomFields')}</li>
            <li>{tf('deleteNotes')}</li>
            <li>{tf('deleteOpps')}</li>
            <li>{tf('deleteConversations')}</li>
          </ul>
          <p className="text-xs text-ink-500">
            {tf('deleteAudit')}
          </p>
        </div>
      ),
      confirmLabel: tf('deletePermanently'),
      cancelLabel: tf('cancel'),
      danger: true,
    });
    if (!ok) return;
    startDeleting(async () => {
      try {
        await apiFetch(`/clients/${client.id}`, { method: 'DELETE' });
        toast.success(tToasts('clientDeleted'));
        router.replace('/app/clients');
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : tf('deleteError'));
      }
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{tf('infoTitle')}</h2>
        <button type="button" className="text-xs text-primary-700 hover:underline" onClick={() => setEditing(true)}>
          {tf('edit')}
        </button>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {client.lastName && <Row label={tf('lastName')} value={client.lastName} />}
        <Row label={tf('email')} value={client.email ?? '—'} />
        <Row label={tf('phone')} value={client.phone ?? '—'} />
        <Row label={tf('source')} value={client.source ?? '—'} />
        <Row label={tf('registeredAt')} value={new Date(client.createdAt).toLocaleString('es-ES')} />
      </dl>
      <div className="mt-5 border-t border-ink-100 pt-4">
        <button
          type="button"
          disabled={deleting}
          onClick={remove}
          className={buttonClass('danger', 'text-xs')}
        >
          {deleting ? tf('deleting') : tf('deleteClient')}
        </button>
        <p className="mt-2 text-xs text-ink-500">
          {tf('deleteFooter')}
        </p>
      </div>
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
