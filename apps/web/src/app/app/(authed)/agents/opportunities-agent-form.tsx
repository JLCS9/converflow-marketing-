'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  Card,
  Field,
  Input,
  Select,
  Textarea,
  buttonClass,
} from '@/components/ui/primitives';
import { useLabelMaps } from '@/lib/use-labels';

interface OppsConfig {
  leadSource?: 'IMPORT' | 'AUTOMATIC';
  thresholdClient?: number;
  thresholdLost?: number;
  actionOpenOpportunity?: boolean;
  actionAssignOwner?: boolean;
  /** number → upper threshold to trigger task; undefined/0 = off */
  actionCreateTaskAbove?: number;
  /** number → days to trigger watcher; undefined/0 = off */
  watcherDaysWithoutActivity?: number;
  defaultUpdateStatus?: boolean;
}

export interface OpportunitiesAgentData {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  status: string;
  config: OppsConfig | null;
}

export function OpportunitiesAgentForm({
  agent,
  template,
}: {
  agent?: OpportunitiesAgentData;
  template?: {
    id: string;
    label: string;
    defaults?: { name?: string; systemPrompt?: string };
  };
}) {
  const t = useTranslations('agents');
  const { AGENT_STATUS } = useLabelMaps();
  const router = useRouter();
  const cfg = agent?.config ?? {};

  const defaultOpportunitiesPrompt = t('oppsDefaultPrompt');

  // Toggle "crear tarea si supera umbral" with its own threshold; we use a
  // sentinel boolean state so the input doesn't trip required-validators.
  const [createTaskEnabled, setCreateTaskEnabled] = useState(
    cfg.actionCreateTaskAbove != null,
  );
  const [watcherEnabled, setWatcherEnabled] = useState(
    cfg.watcherDaysWithoutActivity != null && cfg.watcherDaysWithoutActivity > 0,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const config: OppsConfig = {
            leadSource: (f.get('leadSource') as 'IMPORT' | 'AUTOMATIC') ?? 'IMPORT',
            thresholdClient: Number(f.get('thresholdClient') ?? 70),
            thresholdLost: Number(f.get('thresholdLost') ?? 30),
            actionOpenOpportunity: f.get('actionOpenOpportunity') === 'on',
            actionAssignOwner: f.get('actionAssignOwner') === 'on',
            actionCreateTaskAbove: createTaskEnabled
              ? Number(f.get('actionCreateTaskAboveValue') ?? 75)
              : undefined,
            watcherDaysWithoutActivity: watcherEnabled
              ? Number(f.get('watcherDaysWithoutActivityValue') ?? 7)
              : undefined,
            // Legacy bulk-score modal defaults — kept for back-compat.
            defaultUpdateStatus: true,
          };
          const payload = {
            name: String(f.get('name') ?? '').trim(),
            description: String(f.get('description') ?? '').trim() || undefined,
            systemPrompt: String(f.get('systemPrompt') ?? '').trim(),
            status: String(f.get('status') ?? 'DRAFT'),
            type: 'OPPORTUNITIES',
            template: agent ? undefined : template?.id,
            config,
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
        {/* Template banner. */}
        {template && !agent && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-primary-100 bg-primary-50/40 p-3 text-sm">
            <div className="text-ink-900">
              {t('templateWord')} <strong>{template.label}</strong> —{' '}
              {t('tplOppsPreconfigured')}{' '}
              <span className="text-ink-500">{t('canChangeAll')}</span>
            </div>
            <Link
              href="/app/agents/new"
              className="shrink-0 text-xs text-primary-700 hover:underline"
            >
              {t('changeTypeArrow')}
            </Link>
          </div>
        )}

        {/* Identificación */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('nameLabel')} required>
            <Input
              name="name"
              defaultValue={agent?.name ?? template?.defaults?.name ?? ''}
              required
              maxLength={80}
            />
          </Field>
          <Field label={t('descriptionLabel')}>
            <Input
              name="description"
              defaultValue={agent?.description ?? ''}
              maxLength={500}
            />
          </Field>
        </div>

        <Field label={t('statusLabel')}>
          <Select name="status" defaultValue={agent?.status ?? 'DRAFT'}>
            <option value="DRAFT">{AGENT_STATUS.DRAFT}</option>
            <option value="PUBLISHED">{AGENT_STATUS.PUBLISHED}</option>
            <option value="ARCHIVED">{AGENT_STATUS.ARCHIVED}</option>
          </Select>
        </Field>

        {/* Fuente de leads */}
        <Field label={t('leadSourceLabel')} help={t('leadSourceHelp')}>
          <Select name="leadSource" defaultValue={cfg.leadSource ?? 'IMPORT'}>
            <option value="IMPORT">{t('leadSourceImport')}</option>
            <option value="AUTOMATIC">{t('leadSourceAuto')}</option>
          </Select>
        </Field>

        {/* Reglas de puntuación */}
        <Field label={t('scoringRulesLabel')} required help={t('scoringRulesHelp')}>
          <Textarea
            name="systemPrompt"
            rows={8}
            required
            defaultValue={
              agent?.systemPrompt ??
              template?.defaults?.systemPrompt ??
              defaultOpportunitiesPrompt
            }
            placeholder={template?.defaults?.systemPrompt ?? defaultOpportunitiesPrompt}
          />
        </Field>

        {/* Mapeo score → estado */}
        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('scoreMappingTitle')}
          </div>
          <p className="text-xs text-ink-500">{t('scoreMappingBody')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('thresholdClientLabel')} help={t('thresholdClientHelp')}>
              <Input
                type="number"
                name="thresholdClient"
                min={0}
                max={100}
                defaultValue={cfg.thresholdClient ?? 70}
              />
            </Field>
            <Field label={t('thresholdLostLabel')} help={t('thresholdLostHelp')}>
              <Input
                type="number"
                name="thresholdLost"
                min={0}
                max={100}
                defaultValue={cfg.thresholdLost ?? 30}
              />
            </Field>
          </div>
          <p className="text-[11px] text-ink-500">
            {t('betweenThresholds')} <em>Lead</em>.
          </p>
        </div>

        {/* Acciones al puntuar */}
        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('actionsTitle')}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="actionOpenOpportunity"
              defaultChecked={cfg.actionOpenOpportunity ?? true}
              className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              <strong>{t('openOppStrong')}</strong> {t('openOppDesc')}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="actionAssignOwner"
              defaultChecked={cfg.actionAssignOwner ?? false}
              className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              <strong>{t('assignOwnerStrong')}</strong> {t('assignOwnerDesc')}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={createTaskEnabled}
              onChange={(e) => setCreateTaskEnabled(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="flex-1">
              <strong>{t('createTaskStrong')}</strong> {t('scoreWord')}{' '}
              <input
                type="number"
                name="actionCreateTaskAboveValue"
                min={0}
                max={100}
                defaultValue={cfg.actionCreateTaskAbove ?? 75}
                disabled={!createTaskEnabled}
                className="mx-1 inline-block w-16 rounded-md border border-ink-300 px-2 py-0.5 text-sm disabled:bg-ink-100"
              />{' '}
              {t('createTaskDesc')}
            </span>
          </label>
        </div>

        {/* Vigilancia */}
        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('watchTitle')}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={watcherEnabled}
              onChange={(e) => setWatcherEnabled(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="flex-1">
              <strong>{t('watcherStrong')}</strong>{' '}
              <input
                type="number"
                name="watcherDaysWithoutActivityValue"
                min={1}
                max={365}
                defaultValue={cfg.watcherDaysWithoutActivity ?? 7}
                disabled={!watcherEnabled}
                className="mx-1 inline-block w-16 rounded-md border border-ink-300 px-2 py-0.5 text-sm disabled:bg-ink-100"
              />{' '}
              {t('watcherDaysSuffix')}
            </span>
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
            onClick={() => router.push('/app/agents')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            className={buttonClass('primary')}
            disabled={pending}
          >
            {pending ? t('saving') : agent ? t('saveChanges') : t('createAgent')}
          </button>
        </div>
      </form>
    </Card>
  );
}
