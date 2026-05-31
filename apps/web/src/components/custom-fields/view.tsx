'use client';

import { apiFetch } from '@/lib/api-client';
import type { CustomFieldDefinition, CustomFieldDocumentValue } from './types';

async function openDocument(id: string) {
  try {
    const { url } = await apiFetch<{ url: string }>(`/documents/${id}/download`);
    window.open(url, '_blank');
  } catch {
    /* ignore */
  }
}

interface Props {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown> | null | undefined;
}

export function CustomFieldsView({ definitions, values }: Props) {
  const v = values ?? {};
  const visible = definitions.filter((d) => !d.archivedAt);
  if (visible.length === 0) return null;
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      {visible.map((def) => (
        <div key={def.id}>
          <dt className="text-xs text-ink-500">{def.label}</dt>
          <dd className="mt-1 text-ink-900">{renderValue(def, v[def.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderValue(def: CustomFieldDefinition, value: unknown): React.ReactNode {
  if (value === undefined || value === null || value === '') return <span className="text-ink-400">—</span>;
  switch (def.type) {
    case 'BOOLEAN':
      return value ? 'Sí' : 'No';
    case 'DATE':
      try {
        return new Date(value as string).toLocaleDateString('es-ES');
      } catch {
        return String(value);
      }
    case 'SELECT': {
      const opt = (def.options ?? []).find((o) => o.value === value);
      return opt?.label ?? String(value);
    }
    case 'MULTISELECT': {
      const arr = Array.isArray(value) ? value : [value];
      const labels = arr.map((v) => (def.options ?? []).find((o) => o.value === v)?.label ?? String(v));
      return labels.join(', ');
    }
    case 'URL':
      return (
        <a className="text-primary-700 hover:underline" href={String(value)} target="_blank" rel="noreferrer">
          {String(value)}
        </a>
      );
    case 'EMAIL':
      return (
        <a className="text-primary-700 hover:underline" href={`mailto:${value}`}>
          {String(value)}
        </a>
      );
    case 'PHONE':
      return (
        <a className="text-primary-700 hover:underline" href={`tel:${value}`}>
          {String(value)}
        </a>
      );
    case 'DOCUMENT': {
      const doc = value as CustomFieldDocumentValue;
      return (
        <button
          type="button"
          className="text-primary-700 hover:underline"
          onClick={() => void openDocument(doc.documentId)}
        >
          📎 {doc.name}
        </button>
      );
    }
    case 'NUMBER':
      return new Intl.NumberFormat('es-ES').format(Number(value));
    default:
      return String(value);
  }
}
