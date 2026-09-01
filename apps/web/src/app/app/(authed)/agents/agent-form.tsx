'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { useLabelMaps } from '@/lib/use-labels';
import { AGENT_TOOLS, DEFAULT_AI_DISCLOSURE } from '@converflow/shared';

const TOOL_LABEL_KEY: Record<string, string> = {
  schedule_meeting: 'toolScheduleMeeting',
  create_opportunity: 'toolCreateOpportunity',
  update_opportunity: 'toolUpdateOpportunity',
  escalate_to_human: 'toolEscalateToHuman',
  create_support_task: 'toolCreateSupportTask',
};

// create_support_task is driven by the Soporte section toggle below, not the
// generic tools checklist, to keep its routing config in one place.
const CHECKLIST_TOOLS = AGENT_TOOLS.filter((tool) => tool !== 'create_support_task');

interface SupportRouteUI {
  topic: string;
  keywords: string; // comma-separated in the UI
  ownerId: string;
}

interface SupportConfigData {
  enabled?: boolean;
  routes?: { topic: string; keywords?: string[]; ownerId: string }[];
  fallbackOwnerId?: string;
  defaultPriority?: string;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
}

interface AgentConfig {
  language?: string;
  tone?: string;
  businessInfo?: string;
  faqs?: string;
  aiDisclosure?: string;
  tools?: string[];
  support?: SupportConfigData;
  // mode is legacy — replyMode lives on Bot now.
  mode?: 'SUGGEST' | 'AUTO';
}

// AgentType lives in @converflow/shared (15 values). Re-exported for the
// pages that import { AgentType } from this file (legacy convenience).
export type { AgentType } from '@converflow/shared';
import type { AgentType } from '@converflow/shared';

export interface AgentData {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  status: string;
  type: AgentType;
  config: AgentConfig | null;
}

export function AgentForm({
  agent,
  initialType,
  lockType,
  template,
}: {
  agent?: AgentData;
  initialType?: AgentType;
  /** When true the Type select doesn't render (Step 2 of the new-agent wizard
   *  has the type already committed). */
  lockType?: boolean;
  /** Wizard template that produced this form. Defaults (name, prompt, tools)
   *  + the "Plantilla X" banner come from here in Commit C. */
  template?: { id: string; label: string; defaults?: { name?: string; systemPrompt?: string; tools?: string[] } };
}) {
  const t = useTranslations('agents');
  const { PRIORITY, AGENT_STATUS } = useLabelMaps();
  const router = useRouter();
  const cfg = agent?.config ?? {};
  const [type, setType] = useState<AgentType>(agent?.type ?? initialType ?? 'CONVERSATIONAL');
  // Tools state. When the wizard sent a template that prefills some tools,
  // we honour it on a fresh form; an existing agent's saved tools always win.
  const [tools, setTools] = useState<string[]>(
    cfg.tools ?? (agent ? [] : template?.defaults?.tools ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Support / ticketing config (CONVERSATIONAL only).
  const initSupport = cfg.support ?? {};
  const [supportEnabled, setSupportEnabled] = useState<boolean>(initSupport.enabled ?? false);
  const [supportPriority, setSupportPriority] = useState<string>(
    initSupport.defaultPriority ?? 'MEDIUM',
  );
  const [fallbackOwnerId, setFallbackOwnerId] = useState<string>(initSupport.fallbackOwnerId ?? '');
  const [routes, setRoutes] = useState<SupportRouteUI[]>(
    (initSupport.routes ?? []).map((r) => ({
      topic: r.topic,
      keywords: (r.keywords ?? []).join(', '),
      ownerId: r.ownerId,
    })),
  );
  const [users, setUsers] = useState<TenantUser[]>([]);

  // Load the tenant's users for the responsible selects (only when relevant).
  useEffect(() => {
    let active = true;
    apiFetch<TenantUser[]>('/users/assignable')
      .then((u) => active && setUsers(Array.isArray(u) ? u : []))
      .catch(() => active && setUsers([]));
    return () => {
      active = false;
    };
  }, []);

  function toggleTool(tool: string) {
    setTools((v) => (v.includes(tool) ? v.filter((x) => x !== tool) : [...v, tool]));
  }

  function addRoute() {
    setRoutes((v) => [...v, { topic: '', keywords: '', ownerId: '' }]);
  }
  function updateRoute(i: number, patch: Partial<SupportRouteUI>) {
    setRoutes((v) => v.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRoute(i: number) {
    setRoutes((v) => v.filter((_, idx) => idx !== i));
  }

  function buildSupportConfig(): SupportConfigData {
    if (!supportEnabled) return { enabled: false };
    return {
      enabled: true,
      defaultPriority: supportPriority,
      fallbackOwnerId: fallbackOwnerId || undefined,
      routes: routes
        .filter((r) => r.topic.trim() && r.ownerId)
        .map((r) => ({
          topic: r.topic.trim(),
          ownerId: r.ownerId,
          keywords: r.keywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
        })),
    };
  }

  const isConversational = type === 'CONVERSATIONAL';
  const isOpportunities = type === 'OPPORTUNITIES';
  // Tools the template marked as the "core" of this preset. Shown with a
  // small tag, but the user can still uncheck them.
  const templateCoreTools = new Set(template?.defaults?.tools ?? []);

  // System-prompt skeleton: template default wins; otherwise fall back to a
  // generic skeleton per engine.
  const systemPromptSkeleton =
    template?.defaults?.systemPrompt ??
    (isOpportunities ? t('defaultOpportunitiesPrompt') : t('defaultConversationalPrompt'));
  const nameSkeleton = template?.defaults?.name ?? '';

  return (
    <Card>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const payload = {
            name: String(f.get('name') ?? '').trim(),
            description: String(f.get('description') ?? '').trim() || undefined,
            systemPrompt: String(f.get('systemPrompt') ?? '').trim(),
            model: String(f.get('model') ?? 'claude-sonnet-4-6'),
            status: String(f.get('status') ?? 'DRAFT'),
            type,
            // Persist the template id only on creation; editing an agent
            // keeps the original template (or null).
            template: agent ? undefined : template?.id,
            config: isConversational
              ? {
                  language: String(f.get('language') ?? '').trim() || undefined,
                  tone: String(f.get('tone') ?? '').trim() || undefined,
                  businessInfo: String(f.get('businessInfo') ?? '').trim() || undefined,
                  faqs: String(f.get('faqs') ?? '').trim() || undefined,
                  aiDisclosure:
                    String(f.get('aiDisclosure') ?? '').trim() || DEFAULT_AI_DISCLOSURE,
                  tools,
                  support: buildSupportConfig(),
                }
              : isOpportunities
              ? {
                  defaultUpdateStatus: f.get('defaultUpdateStatus') === 'on',
                  defaultCreateOpportunities: f.get('defaultCreateOpportunities') === 'on',
                }
              : {},
          };
          setError(null);
          startTransition(async () => {
            try {
              if (agent) {
                await apiFetch(`/agents/${agent.id}`, { method: 'PATCH', json: payload });
                router.refresh();
              } else {
                const created = await apiFetch<{ id: string }>('/agents', {
                  method: 'POST',
                  json: payload,
                });
                router.push(`/app/agents/${created.id}`);
              }
            } catch (err) {
              setError(err instanceof ApiError ? err.message : t('unexpectedError'));
            }
          });
        }}
      >
        {/* Template banner. Surfaces "Plantilla X" + a Change-template link
            so the user always knows what preset they're editing. */}
        {template && !agent && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-primary-100 bg-primary-50/40 p-3 text-sm">
            <div>
              <div className="text-ink-900">
                {t('templateWord')} <strong>{template.label}</strong> —{' '}
                {isOpportunities ? t('tplOppsPreconfigured') : t('tplConvPreconfigured')}{' '}
                <span className="text-ink-500">{t('canChangeAll')}</span>
              </div>
            </div>
            <Link
              href="/app/agents/new"
              className="shrink-0 text-xs text-primary-700 hover:underline"
            >
              {t('changeTypeArrow')}
            </Link>
          </div>
        )}

        {/* Type picker — hidden when the parent already committed the type
            (Step 2 of /app/agents/new wizard). On edit we keep it visible so
            the user can re-classify an existing agent — but we only let them
            choose from the runtime-available purposes. */}
        {!lockType && (
          <Field label={t('typeLabel')} required help={t('typeHelp')}>
            <Select value={type} onChange={(e) => setType(e.target.value as AgentType)}>
              <option value="CONVERSATIONAL">{t('optConversational')}</option>
              <option value="OPPORTUNITIES">{t('optOpportunities')}</option>
              <option value="UTILITY" disabled>
                {t('optUtility')}
              </option>
            </Select>
          </Field>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('nameLabel')} required>
            <Input
              name="name"
              defaultValue={agent?.name ?? nameSkeleton}
              required
              maxLength={80}
            />
          </Field>
          <Field label={t('descriptionLabel')}>
            <Input name="description" defaultValue={agent?.description ?? ''} maxLength={500} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('qualityLabel')}>
            <Select name="model" defaultValue={agent?.model ?? 'claude-sonnet-4-6'}>
              <option value="claude-sonnet-4-6">{t('qualityStandard')}</option>
              <option value="claude-haiku-4-5-20251001">{t('qualityFast')}</option>
            </Select>
          </Field>
          <Field label={t('statusLabel')}>
            <Select name="status" defaultValue={agent?.status ?? 'DRAFT'}>
              <option value="DRAFT">{AGENT_STATUS.DRAFT}</option>
              <option value="PUBLISHED">{AGENT_STATUS.PUBLISHED}</option>
              <option value="ARCHIVED">{AGENT_STATUS.ARCHIVED}</option>
            </Select>
          </Field>
        </div>

        {isConversational && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('languageLabel')}>
              <Input name="language" defaultValue={cfg.language ?? t('languageDefault')} maxLength={20} />
            </Field>
            <Field label={t('toneLabel')}>
              <Input
                name="tone"
                defaultValue={cfg.tone ?? ''}
                placeholder={t('tonePlaceholder')}
                maxLength={160}
              />
            </Field>
          </div>
        )}

        <Field
          label={isOpportunities ? t('funnelRulesLabel') : t('instructionsLabel')}
          required
          help={isOpportunities ? t('promptHelpOpportunities') : t('promptHelpConversational')}
        >
          <Textarea
            name="systemPrompt"
            rows={isOpportunities ? 8 : 6}
            required
            defaultValue={agent?.systemPrompt ?? systemPromptSkeleton}
            placeholder={systemPromptSkeleton}
          />
        </Field>

        {isConversational && (
          <>
            <Field label={t('businessInfoLabel')} help={t('businessInfoHelp')}>
              <Textarea name="businessInfo" rows={5} defaultValue={cfg.businessInfo ?? ''} />
            </Field>

            <Field label={t('faqsLabel')}>
              <Textarea
                name="faqs"
                rows={4}
                defaultValue={cfg.faqs ?? ''}
                placeholder={t('faqsPlaceholder')}
              />
            </Field>

            <div>
              <div className="text-sm font-medium text-ink-900">{t('toolsTitle')}</div>
              <p className="mb-2 text-xs text-ink-500">
                {t('toolsHelp1')} <em>{t('coreOfTemplate')}</em> {t('toolsHelp2')}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHECKLIST_TOOLS.map((tool) => {
                  const isCore = templateCoreTools.has(tool);
                  const labelKey = TOOL_LABEL_KEY[tool];
                  return (
                    <label key={tool} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tools.includes(tool)}
                        onChange={() => toggleTool(tool)}
                      />
                      <span>
                        {labelKey ? t(labelKey) : tool}
                        {isCore && (
                          <span className="ml-1 text-[10px] uppercase tracking-wider text-primary-700">
                            · {t('coreOfTemplate')}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Field label={t('aiDisclosureLabel')} help={t('aiDisclosureHelp')}>
              <Textarea
                name="aiDisclosure"
                rows={2}
                defaultValue={cfg.aiDisclosure ?? DEFAULT_AI_DISCLOSURE}
              />
            </Field>

            {/* ── Soporte / tickets ──────────────────────────────── */}
            <div className="rounded-md border border-ink-100 bg-ink-100/40 p-4 space-y-3">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={supportEnabled}
                  onChange={(e) => setSupportEnabled(e.target.checked)}
                  className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm">
                  <strong>{t('supportTitle')}</strong> {t('supportDesc')}
                </span>
              </label>

              {supportEnabled && (
                <div className="space-y-4 border-t border-ink-100 pt-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('defaultPriorityLabel')}>
                      <Select
                        value={supportPriority}
                        onChange={(e) => setSupportPriority(e.target.value)}
                      >
                        {Object.entries(PRIORITY).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t('defaultOwnerLabel')} help={t('fallbackOwnerHelp')}>
                      <Select
                        value={fallbackOwnerId}
                        onChange={(e) => setFallbackOwnerId(e.target.value)}
                      >
                        <option value="">{t('unassignedOption')}</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-ink-900">{t('routingTitle')}</div>
                    <p className="mb-2 text-xs text-ink-500">{t('routingHelp')}</p>
                    <div className="space-y-2">
                      {routes.map((r, i) => (
                        <div
                          key={i}
                          className="grid items-start gap-2 rounded-md border border-ink-100 bg-white p-2 sm:grid-cols-[1fr_1.2fr_1.4fr_auto]"
                        >
                          <Input
                            placeholder={t('topicPlaceholder')}
                            value={r.topic}
                            maxLength={60}
                            onChange={(e) => updateRoute(i, { topic: e.target.value })}
                          />
                          <Input
                            placeholder={t('keywordsPlaceholder')}
                            value={r.keywords}
                            onChange={(e) => updateRoute(i, { keywords: e.target.value })}
                          />
                          <Select
                            value={r.ownerId}
                            onChange={(e) => updateRoute(i, { ownerId: e.target.value })}
                          >
                            <option value="">{t('ownerOption')}</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </Select>
                          <button
                            type="button"
                            onClick={() => removeRoute(i)}
                            className={buttonClass('ghost', 'px-2')}
                            aria-label={t('removeRule')}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addRoute}
                      className={buttonClass('secondary', 'mt-2')}
                    >
                      {t('addRule')}
                    </button>
                  </div>

                  {users.length === 0 && (
                    <p className="text-xs text-amber-700">
                      {t('noUsersYet')}{' '}
                      <Link href="/app/users" className="underline">
                        {t('usersLink')}
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {isOpportunities && (
          <div className="rounded-md border border-ink-100 bg-ink-100/40 p-3 space-y-2 text-sm">
            <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
              {t('batchDefaultsTitle')}
            </div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="defaultUpdateStatus"
                defaultChecked={(cfg as { defaultUpdateStatus?: boolean }).defaultUpdateStatus ?? true}
                className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <strong>{t('updateStatusStrong')}</strong> {t('updateStatusDesc')}
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="defaultCreateOpportunities"
                defaultChecked={
                  (cfg as { defaultCreateOpportunities?: boolean }).defaultCreateOpportunities ?? true
                }
                className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <strong>{t('createOppStrong')}</strong> {t('createOppDesc')}
              </span>
            </label>
            <p className="text-xs text-ink-500">{t('batchDefaultsNote')}</p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push('/app/agents')} className={buttonClass('secondary')} disabled={pending}>
            {t('cancel')}
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? t('saving') : agent ? t('saveChanges') : t('createAgent')}
          </button>
        </div>
      </form>
    </Card>
  );
}
