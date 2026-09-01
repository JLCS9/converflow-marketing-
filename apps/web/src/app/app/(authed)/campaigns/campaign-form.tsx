'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useLabelMaps } from '@/lib/use-labels';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { RichEmailEditor } from '@/components/ui/rich-email-editor';
import { TemplatePicker } from '@/components/ui/template-picker';

interface Bot {
  id: string;
  name: string;
  channel: string;
  phoneNumber: string | null; // for EMAIL bots this is the address it sends from
}
interface TenantUser {
  id: string;
  name: string;
  email: string;
}
interface Agent {
  id: string;
  name: string;
  status: string;
}

export interface CampaignData {
  id: string;
  name: string;
  channel: string;
  botId: string | null;
  agentId: string | null;
  subject: string | null;
  body: string;
  status: string;
  scheduledAt: string | null;
  audience: {
    entity?: string;
    statuses?: string[];
    sources?: string[];
    ownerId?: string;
    excludeLeadIds?: string[];
    excludeClientIds?: string[];
  } | null;
}

interface PreviewContact {
  leadId: string | null;
  clientId: string | null;
  name: string | null;
  address: string;
}
interface Preview {
  total: number;
  suppressed: number;
  truncated: boolean;
  contacts: PreviewContact[];
}

// Stable key for include/exclude bookkeeping.
function contactKey(c: { leadId: string | null; clientId: string | null }): string {
  return c.leadId ? `L:${c.leadId}` : c.clientId ? `C:${c.clientId}` : '';
}

const CHANNELS = ['EMAIL', 'WHATSAPP'] as const;

export function CampaignForm({ campaign }: { campaign?: CampaignData }) {
  const t = useTranslations('campaigns');
  const { CHANNEL } = useLabelMaps();
  const router = useRouter();
  const a = campaign?.audience ?? {};

  const [name, setName] = useState(campaign?.name ?? '');
  const [channel, setChannel] = useState(campaign?.channel ?? 'EMAIL');
  const [botId, setBotId] = useState(campaign?.botId ?? '');
  const [agentId, setAgentId] = useState(campaign?.agentId ?? '');
  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [body, setBody] = useState(campaign?.body ?? '');
  const [bodyKey, setBodyKey] = useState(0); // remount editor to load a template

  const [entity, setEntity] = useState(a.entity ?? 'BOTH');
  const [statuses, setStatuses] = useState((a.statuses ?? []).join(', '));
  const [sources, setSources] = useState((a.sources ?? []).join(', '));
  const [ownerId, setOwnerId] = useState(a.ownerId ?? '');
  // Deselected contacts (keys "L:<id>" / "C:<id>") layered on top of the filter.
  const [excluded, setExcluded] = useState<Set<string>>(
    () =>
      new Set([
        ...(a.excludeLeadIds ?? []).map((id) => `L:${id}`),
        ...(a.excludeClientIds ?? []).map((id) => `C:${id}`),
      ]),
  );

  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>(
    campaign?.scheduledAt ? 'later' : 'now',
  );
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduledAt ? toLocalInput(campaign.scheduledAt) : '',
  );

  const [bots, setBots] = useState<Bot[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    apiFetch<Bot[]>('/bots')
      .then((b) => active && setBots(Array.isArray(b) ? b : []))
      .catch(() => undefined);
    apiFetch<TenantUser[]>('/users/assignable')
      .then((u) => active && setUsers(Array.isArray(u) ? u : []))
      .catch(() => undefined);
    apiFetch<Agent[]>('/agents')
      .then((ag) => active && setAgents(Array.isArray(ag) ? ag : []))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const channelBots = bots.filter((b) => b.channel === channel);

  function buildAudience() {
    const toList = (s: string) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const ex = [...excluded];
    return {
      entity,
      statuses: toList(statuses),
      sources: toList(sources),
      ownerId: ownerId || undefined,
      excludeLeadIds: ex.filter((k) => k.startsWith('L:')).map((k) => k.slice(2)),
      excludeClientIds: ex.filter((k) => k.startsWith('C:')).map((k) => k.slice(2)),
    };
  }

  function toggleExcluded(key: string, include: boolean) {
    if (!key) return;
    setExcluded((prev) => {
      const next = new Set(prev);
      if (include) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function buildPayload() {
    return {
      name: name.trim(),
      channel,
      botId: botId || undefined,
      agentId: agentId || undefined,
      subject: channel === 'EMAIL' ? subject.trim() : undefined,
      body: body.trim(),
      audience: buildAudience(),
      scheduledAt:
        scheduleMode === 'later' && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    };
  }

  async function doPreview() {
    setPreviewing(true);
    setError(null);
    try {
      const res = await apiFetch<Preview>('/campaigns/preview', {
        method: 'POST',
        json: { channel, audience: buildAudience() },
      });
      setPreview(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('previewError'));
    } finally {
      setPreviewing(false);
    }
  }

  function save(thenLaunch: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        let id = campaign?.id;
        if (id) {
          await apiFetch(`/campaigns/${id}`, { method: 'PATCH', json: buildPayload() });
        } else {
          const created = await apiFetch<{ id: string }>('/campaigns', {
            method: 'POST',
            json: buildPayload(),
          });
          id = created.id;
        }
        if (thenLaunch && id) {
          await apiFetch(`/campaigns/${id}/launch`, { method: 'POST' });
        }
        router.push(`/app/campaigns/${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('unexpectedError'));
      }
    });
  }

  return (
    <Card>
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('name')} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label={t('channelLabel')} required>
            <Select
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value);
                setBotId('');
                setPreview(null);
              }}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL[c] ?? c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label={channel === 'EMAIL' ? t('mailboxLabel') : t('whatsappBotLabel')}
          required
          help={channel === 'EMAIL' ? t('mailboxHelp') : t('whatsappBotHelp')}
        >
          <Select value={botId} onChange={(e) => setBotId(e.target.value)}>
            <option value="">{t('selectMailbox')}</option>
            {channelBots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.phoneNumber ? ` — ${b.phoneNumber}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        {channel === 'EMAIL' && (
          <Field label={t('subject')} required>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </Field>
        )}

        <Field label={t('message')} required help={t('messageHelp')}>
          <div className="mb-2 flex justify-end">
            <TemplatePicker
              onPick={(tpl) => {
                if (tpl.subject) setSubject(tpl.subject);
                setBody(tpl.bodyHtml);
                setBodyKey((k) => k + 1);
              }}
            />
          </div>
          <RichEmailEditor key={bodyKey} initialHtml={body} onChange={setBody} />
        </Field>

        <Field label={t('replyAgentLabel')} help={t('replyAgentHelp')}>
          <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">{t('replyAgentNone')}</option>
            {agents
              .filter((ag) => ag.status !== 'ARCHIVED')
              .map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name}
                </option>
              ))}
          </Select>
        </Field>

        {/* ── Audiencia ─────────────────────────────────────────── */}
        <div className="rounded-md border border-ink-100 bg-ink-100/40 p-4 space-y-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('audience')}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('contacts')}>
              <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="BOTH">{t('audienceBoth')}</option>
                <option value="LEAD">{t('audienceLeads')}</option>
                <option value="CLIENT">{t('audienceClients')}</option>
              </Select>
            </Field>
            <Field label={t('owner')}>
              <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">{t('anyOwner')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('statusesLabel')} help={t('statusesHelp')}>
              <Input
                value={statuses}
                onChange={(e) => setStatuses(e.target.value)}
                placeholder="LEAD, CLIENT"
              />
            </Field>
          </div>
          <Field label={t('sourcesLabel')} help={t('sourcesHelp')}>
            <Input
              value={sources}
              onChange={(e) => setSources(e.target.value)}
              placeholder="web, import, whatsapp"
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void doPreview()}
              className={buttonClass('secondary')}
              disabled={previewing}
            >
              {previewing ? t('computing') : t('previewAudience')}
            </button>
            {preview && (
              <span className="text-sm text-ink-700">
                <strong>{preview.contacts.filter((c) => !excluded.has(contactKey(c))).length}</strong>{' '}
                {t('selectedOf', { total: preview.total })}
                {preview.suppressed > 0 && (
                  <span className="text-ink-500">
                    {' '}
                    · {t('suppressedNote', { count: preview.suppressed })}
                  </span>
                )}
              </span>
            )}
          </div>

          {preview && (
            <div className="rounded-md border border-ink-100 bg-white">
              <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-xs text-ink-500">
                <span>{t('deselectHint')}</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() =>
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        preview.contacts.forEach((c) => next.delete(contactKey(c)));
                        return next;
                      })
                    }
                  >
                    {t('selectAll')}
                  </button>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() =>
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        preview.contacts.forEach((c) => {
                          const k = contactKey(c);
                          if (k) next.add(k);
                        });
                        return next;
                      })
                    }
                  >
                    {t('selectNone')}
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-ink-50">
                {preview.contacts.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-ink-500">{t('noMatches')}</p>
                ) : (
                  preview.contacts.map((c) => {
                    const key = contactKey(c);
                    const included = !excluded.has(key);
                    return (
                      <label
                        key={key || c.address}
                        className="flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-ink-50"
                      >
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={(e) => toggleExcluded(key, e.target.checked)}
                        />
                        <span className="min-w-0 flex-1 truncate">{c.name || c.address}</span>
                        <span className="shrink-0 font-mono text-xs text-ink-400">{c.address}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {preview.truncated && (
                <p className="border-t border-ink-100 px-3 py-2 text-[11px] text-amber-700">
                  {t('truncatedNote')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Programación ──────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-ink-900">{t('whenToSend')}</div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scheduleMode === 'now'}
              onChange={() => setScheduleMode('now')}
            />
            {t('sendOnLaunch')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scheduleMode === 'later'}
              onChange={() => setScheduleMode('later')}
            />
            {t('scheduleLabel')}
            {scheduleMode === 'later' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="ml-2 rounded-md border border-ink-300 px-2 py-1 text-sm"
              />
            )}
          </label>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/campaigns')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => save(false)}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            {pending ? t('saving') : t('saveDraft')}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            className={buttonClass('primary')}
            disabled={pending}
          >
            {scheduleMode === 'later' ? t('saveAndSchedule') : t('saveAndSend')}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ISO → value for <input type="datetime-local"> in local time.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
