'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import {
  ENTITY_LABEL_KEY,
  FIELD_TYPE_LABEL_KEY,
  type CustomFieldDefinition,
  type CustomFieldEntity,
  type CustomFieldOption,
  type CustomFieldType,
} from '@/components/custom-fields/types';

// Lead y Cliente comparten exactamente el mismo set de campos personalizados,
// así que la pestaña CLIENT desaparece del admin. Las páginas de Cliente
// siempre cargan definiciones de LEAD.
const ENTITIES: CustomFieldEntity[] = ['LEAD', 'OPPORTUNITY'];
const TYPES: CustomFieldType[] = [
  'TEXT',
  'LONGTEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTISELECT',
  'URL',
  'EMAIL',
  'PHONE',
  'DOCUMENT',
];

export function CustomFieldsAdmin({ initial }: { initial: CustomFieldDefinition[] }) {
  const t = useTranslations('settings');
  const tUi = useTranslations('uiBits');
  const router = useRouter();
  const [tab, setTab] = useState<CustomFieldEntity>('LEAD');
  const [defs, setDefs] = useState(initial);
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const m: Record<CustomFieldEntity, CustomFieldDefinition[]> = {
      LEAD: [],
      CLIENT: [],
      OPPORTUNITY: [],
      PROFILE: [],
    };
    for (const d of defs) m[d.entityType].push(d);
    for (const k of ENTITIES) {
      m[k].sort((a, b) => a.order - b.order);
    }
    return m;
  }, [defs]);

  async function refresh() {
    const next = await apiFetch<CustomFieldDefinition[]>(
      '/custom-fields?includeArchived=true',
    );
    setDefs(next);
    router.refresh();
  }

  const visible = grouped[tab].filter((d) => !d.archivedAt);
  const archived = grouped[tab].filter((d) => d.archivedAt);

  async function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= visible.length) return;
    const ids = visible.map((d) => d.id);
    [ids[idx], ids[target]] = [ids[target]!, ids[idx]!];
    try {
      await apiFetch('/custom-fields/reorder', {
        method: 'POST',
        json: { entityType: tab, ids },
      });
      await refresh();
    } catch {
      /* swallow — refresh from server will roll back optimistic state */
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
        <div className="inline-flex rounded-md border border-ink-200 p-0.5">
          {ENTITIES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setTab(e)}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                tab === e ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {tUi(ENTITY_LABEL_KEY[e])}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={buttonClass('primary', 'text-xs px-3 py-1.5')}
          onClick={() => setCreating(true)}
        >
          {t('customFields.newField')}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {visible.length === 0 && !creating && (
          <p className="rounded-md border border-dashed border-ink-200 p-4 text-sm text-ink-500">
            {t('customFields.empty', { entity: tUi(ENTITY_LABEL_KEY[tab]).toLowerCase() })}
          </p>
        )}
        {visible.map((def, i) => (
          <DefinitionRow
            key={def.id}
            def={def}
            isFirst={i === 0}
            isLast={i === visible.length - 1}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            onChanged={refresh}
          />
        ))}
        {creating && (
          <CreateForm
            entityType={tab}
            onCancel={() => setCreating(false)}
            onCreated={async () => {
              setCreating(false);
              await refresh();
            }}
          />
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('customFields.archived')}
          </h3>
          <div className="mt-2 space-y-2">
            {archived.map((def) => (
              <div
                key={def.id}
                className="flex items-center justify-between rounded-md border border-ink-100 bg-ink-50 px-3 py-2 text-sm"
              >
                <span className="text-ink-500">
                  {def.label} <span className="font-mono text-xs">({def.key})</span> ·{' '}
                  {tUi(FIELD_TYPE_LABEL_KEY[def.type])}
                </span>
                <button
                  type="button"
                  className="text-xs text-primary-700 hover:underline"
                  onClick={async () => {
                    await apiFetch(`/custom-fields/${def.id}`, {
                      method: 'PATCH',
                      json: { archived: false },
                    });
                    await refresh();
                  }}
                >
                  {t('customFields.restore')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DefinitionRow({
  def,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onChanged,
}: {
  def: CustomFieldDefinition;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => Promise<void> | void;
  onMoveDown: () => Promise<void> | void;
  onChanged: () => Promise<void> | void;
}) {
  const t = useTranslations('settings');
  const tUi = useTranslations('uiBits');
  const { confirm, toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-md border border-ink-100 bg-white">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => void onMoveUp()}
            aria-label={t('customFields.moveUp')}
            title={t('customFields.moveUp')}
            className="text-xs leading-none text-ink-500 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-200"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => void onMoveDown()}
            aria-label={t('customFields.moveDown')}
            title={t('customFields.moveDown')}
            className="text-xs leading-none text-ink-500 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-200"
          >
            ▼
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-900">
            {def.label}
            {def.required && <span className="ml-1 text-red-600">*</span>}
          </div>
          <div className="text-xs text-ink-500">
            <span className="font-mono">{def.key}</span> · {tUi(FIELD_TYPE_LABEL_KEY[def.type])}
            {def.helpText && <> · {def.helpText}</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-ink-600 hover:text-ink-900"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? t('customFields.close') : t('customFields.edit')}
          </button>
          <button
            type="button"
            className="text-xs text-red-600 hover:underline"
            onClick={async () => {
              const ok = await confirm({
                title: t('customFields.archiveTitle', { label: def.label }),
                description: t('customFields.archiveDescription'),
                confirmLabel: t('customFields.archive'),
                danger: true,
              });
              if (!ok) return;
              try {
                await apiFetch(`/custom-fields/${def.id}`, { method: 'DELETE' });
                toast.success(t('customFields.fieldArchived'));
                await onChanged();
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : t('customFields.archiveError'));
              }
            }}
          >
            {t('customFields.archive')}
          </button>
        </div>
      </div>
      {editing && (
        <EditForm
          def={def}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function EditForm({
  def,
  onClose,
  onSaved,
}: {
  def: CustomFieldDefinition;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const t = useTranslations('settings');
  const [label, setLabel] = useState(def.label);
  const [required, setRequired] = useState(def.required);
  const [helpText, setHelpText] = useState(def.helpText ?? '');
  const [options, setOptions] = useState<CustomFieldOption[]>(def.options ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsOptions = def.type === 'SELECT' || def.type === 'MULTISELECT';

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/custom-fields/${def.id}`, {
        method: 'PATCH',
        json: {
          label,
          required,
          helpText: helpText || undefined,
          options: needsOptions ? options : undefined,
        },
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('customFields.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-ink-100 bg-ink-50 px-3 py-3">
      <Field label={t('customFields.label')} required>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label={t('customFields.helpText')}>
        <Input value={helpText} onChange={(e) => setHelpText(e.target.value)} />
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="rounded border-ink-300"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        {t('customFields.requiredField')}
      </label>
      {needsOptions && <OptionsEditor options={options} onChange={setOptions} />}
      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}
      <div className="flex gap-2">
        <button type="button" className={buttonClass('primary', 'text-xs')} disabled={busy} onClick={save}>
          {busy ? t('customFields.saving') : t('customFields.save')}
        </button>
        <button type="button" className={buttonClass('secondary', 'text-xs')} onClick={onClose}>
          {t('customFields.cancel')}
        </button>
      </div>
    </div>
  );
}

function CreateForm({
  entityType,
  onCancel,
  onCreated,
}: {
  entityType: CustomFieldEntity;
  onCancel: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const t = useTranslations('settings');
  const tUi = useTranslations('uiBits');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('TEXT');
  const [required, setRequired] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [options, setOptions] = useState<CustomFieldOption[]>([
    { value: 'opt1', label: t('customFields.optionN', { n: 1 }) },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsOptions = type === 'SELECT' || type === 'MULTISELECT';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiFetch('/custom-fields', {
        method: 'POST',
        json: {
          entityType,
          label,
          type,
          required,
          helpText: helpText || undefined,
          options: needsOptions ? options : undefined,
        },
      });
      await onCreated();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t('customFields.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-md border border-primary-200 bg-primary-50/30 p-4"
    >
      <h3 className="text-sm font-medium">
        {t('customFields.newFieldIn', { entity: tUi(ENTITY_LABEL_KEY[entityType]).toLowerCase() })}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('customFields.visibleLabel')} required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>
        <Field label={t('customFields.dataType')} required>
          <Select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
            {TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {tUi(FIELD_TYPE_LABEL_KEY[ft])}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t('customFields.helpTextOptional')}>
        <Input value={helpText} onChange={(e) => setHelpText(e.target.value)} />
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="rounded border-ink-300"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        {t('customFields.requiredField')}
      </label>
      {needsOptions && <OptionsEditor options={options} onChange={setOptions} />}
      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass('primary', 'text-xs')} disabled={busy}>
          {busy ? t('customFields.creating') : t('customFields.createField')}
        </button>
        <button type="button" className={buttonClass('secondary', 'text-xs')} onClick={onCancel}>
          {t('customFields.cancel')}
        </button>
      </div>
    </form>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: CustomFieldOption[];
  onChange: (o: CustomFieldOption[]) => void;
}) {
  const t = useTranslations('settings');
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono uppercase tracking-wider text-ink-500">{t('customFields.options')}</div>
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder={t('customFields.valuePlaceholder')}
            value={o.value}
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...next[i]!, value: e.target.value };
              onChange(next);
            }}
            className="font-mono text-xs"
          />
          <Input
            placeholder={t('customFields.labelPlaceholder')}
            value={o.label}
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...next[i]!, label: e.target.value };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="text-xs text-red-600"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-primary-700 hover:underline"
        onClick={() =>
          onChange([
            ...options,
            {
              value: `opt${options.length + 1}`,
              label: t('customFields.optionN', { n: options.length + 1 }),
            },
          ])
        }
      >
        {t('customFields.addOption')}
      </button>
    </div>
  );
}
