'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Badge, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

export interface RuleRow {
  id: string;
  channel: string;
  endpointId: string | null;
  name: string;
  order: number;
  enabled: boolean;
  keywords: string[] | null;
  fromDomain: string | null;
  assignUserId: string;
}

interface Props {
  initialRules: RuleRow[];
  mailboxes: { id: string; fromAddress: string }[];
  team: { id: string; name: string }[];
}

const EMPTY = {
  id: undefined as string | undefined,
  endpointId: '' as string,
  name: '',
  keywords: '',
  fromDomain: '',
  assignUserId: '',
  order: 0,
};

/**
 * Atención autónoma · Reglas de asignación del correo. La tabla es la MISMA
 * para todos los canales (routing_rules); esta vista gestiona channel=EMAIL.
 */
export function MailRoutingRules({ initialRules, mailboxes, team }: Props) {
  const t = useTranslations('mailboxes');
  const { toast, confirm } = useFeedback();
  const [rules, setRules] = useState(initialRules);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);

  const teamName = (id: string) => team.find((u) => u.id === id)?.name ?? id;
  const mailboxName = (id: string | null) =>
    id ? (mailboxes.find((m) => m.id === id)?.fromAddress ?? id) : t('ruleAllMailboxes');

  async function refresh() {
    setRules(await apiFetch<RuleRow[]>('/routing-rules?channel=EMAIL'));
  }

  async function save() {
    if (!form) return;
    const keywords = form.keywords.split(',').map((k) => k.trim()).filter(Boolean);
    if (form.name.trim().length < 2 || !form.assignUserId || (!keywords.length && !form.fromDomain.trim())) {
      toast.error(t('ruleIncomplete'));
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/routing-rules', {
        method: 'POST',
        json: {
          id: form.id,
          channel: 'EMAIL',
          endpointId: form.endpointId || null,
          name: form.name.trim(),
          order: form.order,
          keywords,
          fromDomain: form.fromDomain.trim() || null,
          assignUserId: form.assignUserId,
        },
      });
      toast.success(t('ruleSaved'));
      setForm(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(rule: RuleRow) {
    const ok = await confirm({ title: t('ruleDeleteTitle'), description: rule.name, danger: true });
    if (!ok) return;
    try {
      await apiFetch(`/routing-rules/${rule.id}`, { method: 'DELETE' });
      await refresh();
    } catch {
      toast.error(t('saveFailed'));
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ink-900">{t('rulesTitle')}</h2>
        <p className="text-sm text-ink-500">{t('rulesHint')}</p>
      </div>

      {rules.length > 0 && (
        <Card className="divide-y divide-ink-100 p-0">
          {rules.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{r.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {mailboxName(r.endpointId)}
                  {r.keywords?.length ? ` · ${t('ruleIfContains')}: ${r.keywords.join(', ')}` : ''}
                  {r.fromDomain ? ` · ${t('ruleFromDomain')}: @${r.fromDomain}` : ''}
                  {' → '}
                  <strong className="text-ink-700">{teamName(r.assignUserId)}</strong>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!r.enabled && <Badge color="gray">{t('ruleDisabled')}</Badge>}
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: r.id,
                      endpointId: r.endpointId ?? '',
                      name: r.name,
                      keywords: (r.keywords ?? []).join(', '),
                      fromDomain: r.fromDomain ?? '',
                      assignUserId: r.assignUserId,
                      order: r.order,
                    })
                  }
                  className="text-xs font-medium text-ink-600 hover:underline"
                >
                  {t('ruleEdit')}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  {t('ruleDelete')}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {form ? (
        <Card className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('ruleName')}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
            </Field>
            <Field label={t('ruleMailbox')}>
              <Select value={form.endpointId} onChange={(e) => setForm({ ...form, endpointId: e.target.value })}>
                <option value="">{t('ruleAllMailboxes')}</option>
                {mailboxes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fromAddress}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('ruleKeywords')} help={t('ruleKeywordsHelp')}>
              <Input
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                placeholder="factura, cobro, pago"
              />
            </Field>
            <Field label={t('ruleDomain')} help={t('ruleDomainHelp')}>
              <Input
                value={form.fromDomain}
                onChange={(e) => setForm({ ...form, fromDomain: e.target.value })}
                placeholder="acme.com"
              />
            </Field>
          </div>
          <Field label={t('ruleAssignTo')} help={t('ruleAssignHelp')}>
            <Select value={form.assignUserId} onChange={(e) => setForm({ ...form, assignUserId: e.target.value })}>
              <option value="">{t('rulePickPerson')}</option>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={saving} className={buttonClass('primary')}>
              {saving ? t('saving') : t('ruleSave')}
            </button>
            <button type="button" onClick={() => setForm(null)} className={buttonClass('ghost')}>
              {t('cancel')}
            </button>
          </div>
        </Card>
      ) : (
        <button type="button" onClick={() => setForm({ ...EMPTY, order: rules.length })} className={buttonClass('secondary')}>
          {t('ruleNew')}
        </button>
      )}
    </section>
  );
}
