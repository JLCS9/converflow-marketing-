'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { Field, Input, Select, Textarea } from '@/components/ui/primitives';
import type {
  CustomFieldDefinition,
  CustomFieldDocumentValue,
  CustomFieldOption,
} from './types';

interface Props {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function CustomFieldsForm({ definitions, values, onChange, disabled }: Props) {
  if (definitions.length === 0) return null;
  const set = (key: string, v: unknown) => {
    const next = { ...values };
    if (v === undefined || v === '' || v === null) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  return (
    <div className="space-y-4">
      {definitions.map((def) => (
        <CustomFieldRow
          key={def.id}
          def={def}
          value={values[def.key]}
          onChange={(v) => set(def.key, v)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function CustomFieldRow({
  def,
  value,
  onChange,
  disabled,
}: {
  def: CustomFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const help = def.helpText ?? undefined;
  const required = def.required;

  switch (def.type) {
    case 'TEXT':
    case 'URL':
    case 'EMAIL':
    case 'PHONE':
      return (
        <Field label={def.label} help={help} required={required}>
          <Input
            type={def.type === 'EMAIL' ? 'email' : def.type === 'URL' ? 'url' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
          />
        </Field>
      );
    case 'LONGTEXT':
      return (
        <Field label={def.label} help={help} required={required}>
          <Textarea
            rows={4}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
          />
        </Field>
      );
    case 'NUMBER':
      return (
        <Field label={def.label} help={help} required={required}>
          <Input
            type="number"
            value={value == null ? '' : String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') onChange(undefined);
              else onChange(Number(raw));
            }}
            required={required}
            disabled={disabled}
          />
        </Field>
      );
    case 'DATE': {
      const dateStr =
        typeof value === 'string' && value
          ? new Date(value).toISOString().slice(0, 10)
          : '';
      return (
        <Field label={def.label} help={help} required={required}>
          <Input
            type="date"
            value={dateStr}
            onChange={(e) => onChange(e.target.value || undefined)}
            required={required}
            disabled={disabled}
          />
        </Field>
      );
    }
    case 'BOOLEAN':
      return (
        <Field label={def.label} help={help}>
          <label className="mt-1 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded border-ink-300 text-primary-600 focus:ring-primary-500"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
            />
            <span>{def.helpText ?? 'Activar'}</span>
          </label>
        </Field>
      );
    case 'SELECT': {
      const options: CustomFieldOption[] = def.options ?? [];
      return (
        <Field label={def.label} help={help} required={required}>
          <Select
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            required={required}
            disabled={disabled}
          >
            <option value="">{required ? 'Selecciona…' : '— sin valor —'}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    }
    case 'MULTISELECT': {
      const options: CustomFieldOption[] = def.options ?? [];
      const selected = new Set(
        Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [],
      );
      return (
        <Field label={def.label} help={help} required={required}>
          <div className="mt-1 grid gap-1.5 rounded-md border border-ink-200 p-2">
            {options.map((o) => (
              <label key={o.value} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                  checked={selected.has(o.value)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(o.value);
                    else next.delete(o.value);
                    onChange(next.size ? Array.from(next) : undefined);
                  }}
                  disabled={disabled}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </Field>
      );
    }
    case 'DOCUMENT':
      return (
        <DocumentField def={def} value={value} onChange={onChange} disabled={disabled} />
      );
  }
}

function DocumentField({
  def,
  value,
  onChange,
  disabled,
}: {
  def: CustomFieldDefinition;
  value: unknown;
  onChange: (v: CustomFieldDocumentValue | undefined) => void;
  disabled?: boolean;
}) {
  const current = (value ?? null) as CustomFieldDocumentValue | null;
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${BASE}/documents/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = res.statusText;
        try {
          msg = (JSON.parse(text) as { error?: { message?: string } })?.error?.message ?? msg;
        } catch {
          /* keep statusText */
        }
        throw new ApiError(res.status, msg, text);
      }
      const doc = (await res.json()) as {
        id: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
      };
      onChange({
        documentId: doc.id,
        name: doc.name,
        mime: doc.mimeType,
        size: doc.sizeBytes,
      });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field label={def.label} help={def.helpText ?? undefined} required={def.required}>
      {current ? (
        <div className="mt-1 flex items-center justify-between rounded-md border border-ink-200 px-3 py-2 text-sm">
          <span className="truncate">
            📎 {current.name}
            {current.size != null && (
              <span className="ml-2 text-xs text-ink-500">
                ({Math.round(current.size / 1024)} KB)
              </span>
            )}
          </span>
          <button
            type="button"
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
            onClick={() => onChange(undefined)}
            disabled={disabled}
          >
            Quitar
          </button>
        </div>
      ) : (
        <input
          type="file"
          className="mt-1 block w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          disabled={disabled || uploading}
        />
      )}
      {uploading && <p className="mt-1 text-xs text-ink-500">Subiendo…</p>}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </Field>
  );
}
