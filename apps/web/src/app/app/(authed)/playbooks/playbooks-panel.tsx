'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { Card, Badge, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/empty-state';
import { useFeedback } from '@/components/ui/feedback';
import type { PlaybookOptions, PlaybookRow, PlaybookStats, RunRow } from './types';

interface Props {
  initialPlaybooks: PlaybookRow[];
  initialDrafts: RunRow[];
  stats: PlaybookStats;
  options: PlaybookOptions;
}

export function PlaybooksPanel({ initialPlaybooks, initialDrafts, stats, options }: Props) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [playbooks, setPlaybooks] = useState(initialPlaybooks);

  async function refreshDrafts() {
    setDrafts(await apiFetch<RunRow[]>('/playbooks/runs?status=DRAFT'));
  }
  async function refreshPlaybooks() {
    setPlaybooks(await apiFetch<PlaybookRow[]>('/playbooks'));
  }

  return (
    <div className="space-y-8">
      <DraftsSection drafts={drafts} onChanged={() => void refreshDrafts()} />
      <PlaybooksSection playbooks={playbooks} stats={stats} options={options} onChanged={() => void refreshPlaybooks()} />
    </div>
  );
}

// =====================================================================
// Borradores pendientes de aprobación
// =====================================================================

function DraftsSection({ drafts, onChanged }: { drafts: RunRow[]; onChanged: () => void }) {
  const t = useTranslations('playbooks');
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(run: RunRow, edited?: string) {
    // E3 · Enviar es irreversible: confirmar SIEMPRE, mostrando a quién va.
    const ok = await confirm({
      title: t('approveConfirmTitle'),
      description: t('approveConfirmBody', { who: run.contactName ?? t('unknownContact') }),
    });
    if (!ok) return;
    setBusy(run.id);
    try {
      const res = await apiFetch<{ ok: boolean; status?: string; reason?: string }>(
        `/playbooks/runs/${run.id}/approve`,
        { method: 'POST', json: edited ? { editedText: edited } : {} },
      );
      if (res.ok) toast.success(t('draftSent'));
      else toast.error(t('draftSendFailed'));
      setEditing(null);
      onChanged();
    } catch {
      toast.error(t('draftSendFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function reject(run: RunRow) {
    const ok = await confirm({ title: t('rejectTitle'), description: run.draftText ?? '', danger: true });
    if (!ok) return;
    try {
      await apiFetch(`/playbooks/runs/${run.id}/reject`, { method: 'POST' });
      toast.success(t('draftRejected'));
      onChanged();
    } catch {
      toast.error(t('genericError'));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-ink-900">
        {t('draftsTitle')}
        {drafts.length > 0 && (
          <span className="ml-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {drafts.length}
          </span>
        )}
      </h2>
      <p className="text-sm text-ink-500">{t('draftsHint')}</p>

      {drafts.length === 0 ? (
        <EmptyState title={t('draftsEmptyTitle')} description={t('draftsEmptyBody')} />
      ) : (
        <div className="space-y-3">
          {drafts.map((run) => (
            <Card key={run.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-500">
                  {run.playbook?.name ?? t('playbook')} ·{' '}
                  <strong className="text-ink-800">
                    {t('draftFor', { who: run.contactName ?? t('unknownContact') })}
                  </strong>
                  {run.conversationId && (
                    <>
                      {' · '}
                      <a href="/app/conversations" className="text-primary-700 hover:underline">
                        {t('viewThread')}
                      </a>
                    </>
                  )}
                  {' · '}
                  {/* toLocaleString difiere entre servidor y navegador */}
                  <span suppressHydrationWarning>{new Date(run.createdAt).toLocaleString()}</span>
                </span>
                <Badge color="yellow">{t('statusDraft')}</Badge>
              </div>
              {editing === run.id ? (
                <div className="space-y-2">
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void approve(run, text.trim())}
                      disabled={busy === run.id || text.trim().length < 2}
                      className={buttonClass('primary', 'text-xs')}
                    >
                      {busy === run.id ? t('sending') : t('approveEdited')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className={buttonClass('ghost', 'text-xs')}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap rounded-md bg-ink-100/60 p-3 text-sm text-ink-800">
                    {run.draftText}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void approve(run)}
                      disabled={busy === run.id}
                      className={buttonClass('primary', 'text-xs')}
                    >
                      {busy === run.id ? t('sending') : t('approveSend')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(run.id);
                        setText(run.draftText ?? '');
                      }}
                      className={buttonClass('secondary', 'text-xs')}
                    >
                      {t('edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void reject(run)}
                      className={buttonClass('ghost', 'text-xs')}
                    >
                      {t('reject')}
                    </button>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

// =====================================================================
// Playbooks (CRUD)
// =====================================================================

const EMPTY_FORM = {
  id: undefined as string | undefined,
  name: '',
  triggerOn: 'transition' as 'transition' | 'event',
  triggerValue: '',
  instructions: '',
  mode: 'DRAFT_APPROVE' as 'DRAFT_APPROVE' | 'AUTO',
  active: true,
  maxPerContactDays: 7,
  requireConsent: true,
  quietStartHour: 21,
  quietEndHour: 9,
};

function PlaybooksSection({
  playbooks,
  stats,
  options,
  onChanged,
}: {
  playbooks: PlaybookRow[];
  stats: PlaybookStats;
  options: PlaybookOptions;
  onChanged: () => void;
}) {
  const t = useTranslations('playbooks');
  const { toast, confirm } = useFeedback();
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(playbooks.length === 0 ? EMPTY_FORM : null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form) return;
    if (form.name.trim().length < 2 || form.triggerValue.trim().length < 1 || form.instructions.trim().length < 10) {
      toast.error(t('formIncomplete'));
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/playbooks', {
        method: 'POST',
        json: {
          id: form.id,
          name: form.name.trim(),
          active: form.active,
          trigger:
            form.triggerOn === 'transition'
              ? { on: 'transition', toState: form.triggerValue.trim() }
              : { on: 'event', eventType: form.triggerValue.trim() },
          action: { kind: 'followup', instructions: form.instructions.trim() },
          mode: form.mode,
          guardrails: {
            maxPerContactDays: form.maxPerContactDays,
            requireConsent: form.requireConsent,
            quietStartHour: form.quietStartHour,
            quietEndHour: form.quietEndHour,
          },
        },
      });
      toast.success(t('saved'));
      setForm(null);
      onChanged();
    } catch {
      toast.error(t('genericError'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(pb: PlaybookRow) {
    const ok = await confirm({ title: t('deleteTitle'), description: pb.name, danger: true });
    if (!ok) return;
    try {
      await apiFetch(`/playbooks/${pb.id}`, { method: 'DELETE' });
      toast.success(t('deleted'));
      onChanged();
    } catch {
      toast.error(t('genericError'));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-ink-900">{t('playbooksTitle')}</h2>
      <p className="text-sm text-ink-500">{t('playbooksHint')}</p>

      {playbooks.length > 0 && (
        <Card className="divide-y divide-ink-100 p-0">
          {playbooks.map((pb) => (
            <div key={pb.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{pb.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {pb.trigger.on === 'transition'
                    ? t('triggerTransition', { state: pb.trigger.toState ?? '' })
                    : t('triggerEvent', { event: pb.trigger.eventType ?? '' })}
                  {stats[pb.id] && stats[pb.id]!.sent > 0 && (
                    <>
                      {' · '}
                      {t('statsLine', {
                        sent: stats[pb.id]!.sent,
                        rate:
                          stats[pb.id]!.replyRate == null
                            ? '—'
                            : `${Math.round(stats[pb.id]!.replyRate! * 100)}%`,
                      })}
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge color={pb.mode === 'AUTO' ? 'red' : 'blue'}>
                  {pb.mode === 'AUTO' ? t('modeAuto') : t('modeDraft')}
                </Badge>
                <Badge color={pb.active ? 'green' : 'gray'}>
                  {pb.active ? t('active') : t('inactive')}
                </Badge>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: pb.id,
                      name: pb.name,
                      triggerOn: pb.trigger.on,
                      triggerValue: pb.trigger.toState ?? pb.trigger.eventType ?? '',
                      instructions: pb.action.instructions,
                      mode: pb.mode,
                      active: pb.active,
                      maxPerContactDays: pb.guardrails?.maxPerContactDays ?? 7,
                      requireConsent: pb.guardrails?.requireConsent !== false,
                      quietStartHour: pb.guardrails?.quietStartHour ?? 21,
                      quietEndHour: pb.guardrails?.quietEndHour ?? 9,
                    })
                  }
                  className="text-xs font-medium text-ink-600 hover:underline"
                >
                  {t('edit')}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(pb)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  {t('delete')}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {form ? (
        <Card className="space-y-4">
          <Field label={t('nameLabel')}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('namePlaceholder')}
              maxLength={80}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('triggerLabel')} help={t('triggerHelp')}>
              <Select
                value={form.triggerOn}
                onChange={(e) =>
                  setForm({ ...form, triggerOn: e.target.value as 'transition' | 'event' })
                }
              >
                <option value="transition">{t('triggerOnTransition')}</option>
                <option value="event">{t('triggerOnEvent')}</option>
              </Select>
            </Field>
            <Field
              label={form.triggerOn === 'transition' ? t('stateLabel') : t('eventLabel')}
              help={
                form.triggerOn === 'transition' && options.states.length === 0
                  ? t('noStatesHelp')
                  : undefined
              }
            >
              {form.triggerOn === 'transition' && options.states.length > 0 ? (
                <Select
                  value={form.triggerValue}
                  onChange={(e) => setForm({ ...form, triggerValue: e.target.value })}
                >
                  <option value="">{t('pickOne')}</option>
                  {options.states.map((st) => (
                    <option key={st.key} value={st.key}>
                      {st.label} ({st.key})
                    </option>
                  ))}
                </Select>
              ) : form.triggerOn === 'event' && options.events.length > 0 ? (
                <Select
                  value={form.triggerValue}
                  onChange={(e) => setForm({ ...form, triggerValue: e.target.value })}
                >
                  <option value="">{t('pickOne')}</option>
                  {options.events.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={form.triggerValue}
                  onChange={(e) => setForm({ ...form, triggerValue: e.target.value })}
                  placeholder={form.triggerOn === 'transition' ? 'dormido' : 'cart_abandoned'}
                  maxLength={60}
                />
              )}
            </Field>
          </div>
          <Field label={t('instructionsLabel')} help={t('instructionsHelp')}>
            <Textarea
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              rows={3}
              placeholder={t('instructionsPlaceholder')}
            />
          </Field>
          <div className="rounded-md border border-ink-100 bg-ink-100/30 p-3">
            <p className="text-xs font-mono uppercase tracking-wider text-ink-500">{t('railsTitle')}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label={t('railFrequency')} help={t('railFrequencyHelp')}>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={form.maxPerContactDays}
                  onChange={(e) => setForm({ ...form, maxPerContactDays: Number(e.target.value) || 7 })}
                />
              </Field>
              <Field label={t('railQuiet')} help={t('railQuietHelp')}>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={0} max={23}
                    value={form.quietStartHour}
                    onChange={(e) => setForm({ ...form, quietStartHour: Number(e.target.value) || 0 })}
                    className="w-20"
                  />
                  <span className="text-xs text-ink-500">→</span>
                  <Input
                    type="number" min={0} max={23}
                    value={form.quietEndHour}
                    onChange={(e) => setForm({ ...form, quietEndHour: Number(e.target.value) || 0 })}
                    className="w-20"
                  />
                </div>
              </Field>
              <Field label={t('railConsent')} help={t('railConsentHelp')}>
                <Select
                  value={form.requireConsent ? '1' : '0'}
                  onChange={(e) => setForm({ ...form, requireConsent: e.target.value === '1' })}
                >
                  <option value="1">{t('railConsentYes')}</option>
                  <option value="0">{t('railConsentNo')}</option>
                </Select>
              </Field>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('modeLabel')} help={t('modeHelp')}>
              <Select
                value={form.mode}
                onChange={(e) =>
                  setForm({ ...form, mode: e.target.value as 'DRAFT_APPROVE' | 'AUTO' })
                }
              >
                <option value="DRAFT_APPROVE">{t('modeDraft')}</option>
                <option value="AUTO">{t('modeAuto')}</option>
              </Select>
            </Field>
            <Field label={t('activeLabel')}>
              <Select
                value={form.active ? '1' : '0'}
                onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}
              >
                <option value="1">{t('active')}</option>
                <option value="0">{t('inactive')}</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className={buttonClass('primary')}
            >
              {saving ? t('saving') : t('save')}
            </button>
            <button type="button" onClick={() => setForm(null)} className={buttonClass('ghost')}>
              {t('cancel')}
            </button>
          </div>
        </Card>
      ) : (
        <button type="button" onClick={() => setForm(EMPTY_FORM)} className={buttonClass('primary')}>
          {t('newPlaybook')}
        </button>
      )}
    </section>
  );
}
