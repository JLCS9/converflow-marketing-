'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  PERMISSION_MODULES,
  type ApiKeyCreated,
  type ApiKeySummary,
  type PermissionModule,
} from '@converflow/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';
import { useFeedback } from '@/components/ui/feedback';
import {
  PermissionsEditor,
  PERMISSION_LABEL_KEYS,
} from '@/components/permissions-editor';

interface Props {
  initialKeys: ApiKeySummary[];
  apiBaseHint: string;
}

/**
 * Stateful panel for /app/settings/developer. Three views:
 *
 * - List of existing keys (with prefix, scopes, last used, status).
 * - "Create key" modal (name + scopes + optional expiration).
 * - One-shot "key created" view that shows the full secret once with a
 *   copy button + a banner reminding the operator it cannot be recovered.
 *
 * The newly created key is also pushed to the top of the in-memory list
 * so users see it immediately after closing the success view.
 */
export function DeveloperPanel({ initialKeys, apiBaseHint }: Props) {
  const t = useTranslations('settings');
  const tUi = useTranslations('uiBits');
  const { toast, confirm } = useFeedback();
  const [keys, setKeys] = useState<ApiKeySummary[]>(initialKeys);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const apiBase = apiBaseHint || 'https://api.converflow.ai';

  function statusOf(k: ApiKeySummary): {
    label: string;
    tone: 'green' | 'red' | 'amber' | 'gray';
  } {
    if (k.revokedAt) return { label: t('developer.statusRevoked'), tone: 'red' };
    if (k.expiresAt && new Date(k.expiresAt) < new Date()) {
      return { label: t('developer.statusExpired'), tone: 'red' };
    }
    if (!k.lastUsedAt) return { label: t('developer.statusNew'), tone: 'amber' };
    return { label: t('developer.statusActive'), tone: 'green' };
  }

  async function revoke(k: ApiKeySummary) {
    const ok = await confirm({
      title: t('developer.revokeTitle', { name: k.name }),
      description: (
        <div className="space-y-2">
          <p>{t('developer.revokeDesc1')}</p>
          <p className="text-xs text-ink-500">{t('developer.revokeDesc2')}</p>
        </div>
      ),
      confirmLabel: t('developer.revokeConfirm'),
      cancelLabel: t('developer.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api-keys/${k.id}`, { method: 'DELETE' });
      setKeys((arr) =>
        arr.map((row) =>
          row.id === k.id ? { ...row, revokedAt: new Date().toISOString() } : row,
        ),
      );
      toast.success(t('developer.keyRevoked'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('developer.revokeError'));
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
              API keys
            </h2>
            <p className="mt-1 text-xs text-ink-500">{t('developer.keysDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={buttonClass('primary')}
          >
            {t('developer.newKey')}
          </button>
        </div>

        {keys.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-ink-200 bg-ink-100/40 p-4 text-sm text-ink-500">
            {t('developer.noKeys')}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="py-3 pr-3">{t('developer.colName')}</th>
                  <th className="hidden py-3 pr-3 md:table-cell">{t('developer.colPrefix')}</th>
                  <th className="hidden py-3 pr-3 lg:table-cell">{t('developer.colScopes')}</th>
                  <th className="hidden py-3 pr-3 md:table-cell">{t('developer.colLastUsed')}</th>
                  <th className="py-3 pr-3">{t('developer.colStatus')}</th>
                  <th className="py-3 pr-0 text-right">{t('developer.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const st = statusOf(k);
                  return (
                    <tr
                      key={k.id}
                      className="border-b border-ink-100 last:border-0"
                    >
                      <td className="py-3 pr-3 align-top">
                        <div className="font-medium text-ink-900">{k.name}</div>
                        <div className="mt-0.5 text-xs text-ink-500 md:hidden">
                          {k.prefix}…
                        </div>
                      </td>
                      <td className="hidden py-3 pr-3 align-top font-mono text-xs text-ink-700 md:table-cell">
                        {k.prefix}…
                      </td>
                      <td className="hidden py-3 pr-3 align-top text-xs text-ink-700 lg:table-cell">
                        <span className="line-clamp-2">
                          {k.scopes.map((s) => tUi(PERMISSION_LABEL_KEYS[s])).join(' · ')}
                        </span>
                      </td>
                      <td className="hidden py-3 pr-3 align-top text-xs text-ink-500 md:table-cell">
                        {k.lastUsedAt
                          ? new Date(k.lastUsedAt).toLocaleString('es-ES')
                          : t('developer.never')}
                      </td>
                      <td className="py-3 pr-3 align-top">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
                            st.tone === 'green'
                              ? 'bg-emerald-100 text-emerald-900'
                              : st.tone === 'red'
                                ? 'bg-red-100 text-red-900'
                                : st.tone === 'amber'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-ink-100 text-ink-700'
                          }`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3 pr-0 text-right align-top">
                        {k.revokedAt ? (
                          <span className="text-xs text-ink-400">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => revoke(k)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            {t('developer.revoke')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          {t('developer.gettingStarted')}
        </h2>
        <div className="mt-3 space-y-3 text-sm text-ink-700">
          <p>
            {t.rich('developer.apiIntro', {
              base: `${apiBase}/v1/`,
              code: (chunks) => <code>{chunks}</code>,
            })}
          </p>
          <pre className="overflow-x-auto rounded-md border border-ink-100 bg-ink-900 p-3 text-xs text-emerald-100">
{`${t('developer.curlListComment')}
curl -s "${apiBase}/v1/leads?limit=50" \\
  -H "Authorization: Bearer cfai_XXXXXXXXXXXXXXXXXXXXXXXXXXXX" \\
  | jq .

${t('developer.curlCreateComment')}
curl -s -X POST "${apiBase}/v1/leads" \\
  -H "Authorization: Bearer cfai_XXXXXXXXXXXXXXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Marta","email":"marta@example.com","source":"web"}'`}
          </pre>
          <p className="text-xs text-ink-500">{t('developer.errorCodes')}</p>
        </div>
      </Card>

      {creating && (
        <CreateKeyModal
          onClose={() => setCreating(false)}
          onCreated={(k) => {
            setCreating(false);
            setCreated(k);
            // Push to the top of the list (without the secret).
            setKeys((arr) => [
              {
                id: k.id,
                name: k.name,
                prefix: k.prefix,
                scopes: k.scopes,
                createdBy: k.createdBy,
                createdAt: k.createdAt,
                expiresAt: k.expiresAt,
                revokedAt: k.revokedAt,
                lastUsedAt: k.lastUsedAt,
              },
              ...arr,
            ]);
          }}
        />
      )}

      {created && <RevealKeyModal data={created} onClose={() => setCreated(null)} />}
    </>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (k: ApiKeyCreated) => void;
}) {
  const t = useTranslations('settings');
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<PermissionModule[]>([
    'crm',
    'conversations',
  ]);
  const [expiresAt, setExpiresAt] = useState('');
  const [pending, startTransition] = useTransition();

  const allModules = useMemo(() => [...PERMISSION_MODULES], []);

  function submit() {
    if (!name.trim()) {
      toast.error(t('developer.nameRequired'));
      return;
    }
    if (scopes.length === 0) {
      toast.error(t('developer.scopeRequired'));
      return;
    }
    startTransition(async () => {
      try {
        const res = await apiFetch<ApiKeyCreated>('/api-keys', {
          method: 'POST',
          json: {
            name: name.trim(),
            scopes,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          },
        });
        onCreated(res);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t('developer.createError'));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
      <div className="w-full max-w-2xl space-y-5 rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t('developer.createTitle')}
            </h2>
            <p className="mt-1 text-sm text-ink-500">{t('developer.createDesc')}</p>
          </div>
          <button
            type="button"
            aria-label={t('developer.close')}
            onClick={onClose}
            className="text-ink-500 hover:text-ink-900"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('developer.nameLabel')} required help={t('developer.nameHelp')}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('developer.namePlaceholder')}
              required
              minLength={2}
              maxLength={80}
            />
          </Field>
          <Field
            label={t('developer.expiresLabel')}
            help={t('developer.expiresHelp')}
          >
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('developer.keyScopes')}
          </div>
          <p className="mt-1 text-xs text-ink-600">{t('developer.keyScopesHelp')}</p>
          <div className="mt-3">
            <PermissionsEditor
              value={scopes}
              onChange={setScopes}
              roleDefaults={allModules}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={buttonClass('secondary')}
          >
            {t('developer.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className={buttonClass('primary')}
          >
            {pending ? t('developer.creating') : t('developer.createAndReveal')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RevealKeyModal({
  data,
  onClose,
}: {
  data: ApiKeyCreated;
  onClose: () => void;
}) {
  const t = useTranslations('settings');
  const tUi = useTranslations('uiBits');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
      <div className="w-full max-w-xl space-y-5 rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold tracking-tight">
          {t('developer.createdTitle')}
        </h2>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {t.rich('developer.copyNow', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </div>
        <div>
          <div className="text-xs text-ink-500">{t('developer.nameLabel')}</div>
          <div className="font-medium text-ink-900">{data.name}</div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-500">Secret</span>
            <CopyButton value={data.secret} />
          </div>
          <code className="block select-all break-all rounded border border-ink-200 bg-ink-900 p-3 font-mono text-xs text-emerald-100">
            {data.secret}
          </code>
        </div>
        <div className="text-xs text-ink-500">
          {t('developer.scopesList', {
            list: data.scopes.map((s) => tUi(PERMISSION_LABEL_KEYS[s])).join(' · '),
          })}
          {data.expiresAt && (
            <>
              {' '}
              {t('developer.expiresOn', {
                date: new Date(data.expiresAt).toLocaleDateString('es-ES'),
              })}
            </>
          )}
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={buttonClass('primary')}>
            {t('developer.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
