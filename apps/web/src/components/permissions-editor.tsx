'use client';

import { useTranslations } from 'next-intl';
import { PERMISSION_MODULES, type PermissionModule } from '@converflow/shared';

/**
 * Dictionary keys (namespace `uiBits`) for each permission module. Kept close
 * to the editor itself so the wording stays consistent across invite/edit/help.
 * Constantes de módulo: guardan claves y se traducen en render (sin hooks aquí).
 */
export const PERMISSION_LABEL_KEYS: Record<PermissionModule, string> = {
  crm: 'permCrm',
  conversations: 'permConversations',
  documents: 'permDocuments',
  agents: 'permAgents',
  bots: 'permBots',
  bulkAi: 'permBulkAi',
  import: 'permImport',
  settings: 'permSettings',
  users: 'permUsers',
  campaigns: 'permCampaigns',
  mail: 'permMail',
};

export const PERMISSION_DESCRIPTION_KEYS: Record<PermissionModule, string> = {
  crm: 'permCrmDesc',
  conversations: 'permConversationsDesc',
  documents: 'permDocumentsDesc',
  agents: 'permAgentsDesc',
  bots: 'permBotsDesc',
  bulkAi: 'permBulkAiDesc',
  import: 'permImportDesc',
  settings: 'permSettingsDesc',
  users: 'permUsersDesc',
  campaigns: 'permCampaignsDesc',
  mail: 'permMailDesc',
};

/**
 * Controlled checklist of permission modules. The parent owns the
 * `value` array; `onChange` receives the next array (canonical order).
 *
 *   <PermissionsEditor value={perms} onChange={setPerms} roleDefaults={...} />
 *
 * - `disabled`: render greyed out (e.g. when the user opted to follow
 *   the role defaults and we still want to show which boxes those
 *   defaults would tick).
 * - `roleDefaults`: when provided, modules included in this set are
 *   marked with a small "(rol)" hint so admins know which checkboxes
 *   come from the role and which are real overrides.
 */
export function PermissionsEditor({
  value,
  onChange,
  disabled,
  roleDefaults,
}: {
  value: PermissionModule[];
  onChange: (next: PermissionModule[]) => void;
  disabled?: boolean;
  roleDefaults?: ReadonlyArray<PermissionModule>;
}) {
  const t = useTranslations('uiBits');
  const set = new Set(value);
  const defaults = new Set(roleDefaults ?? []);

  function toggle(m: PermissionModule, on: boolean) {
    const next = new Set(set);
    if (on) next.add(m);
    else next.delete(m);
    // Canonical order so the DB row is stable across edits.
    onChange(PERMISSION_MODULES.filter((p) => next.has(p)));
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {PERMISSION_MODULES.map((m) => {
        const checked = set.has(m);
        const isDefault = defaults.has(m);
        return (
          <li
            key={m}
            className={`rounded-md border p-2 text-sm ${
              disabled
                ? 'border-ink-100 bg-white/40 text-ink-500'
                : checked
                  ? 'border-primary-200 bg-primary-50/40'
                  : 'border-ink-100 bg-white'
            }`}
          >
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => toggle(m, e.target.checked)}
                className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium text-ink-900">
                  {t(PERMISSION_LABEL_KEYS[m])}
                  {isDefault && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-500">
                      {t('byRole')}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  {t(PERMISSION_DESCRIPTION_KEYS[m])}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
