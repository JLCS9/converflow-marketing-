'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import { CustomFieldsForm } from '@/components/custom-fields/form';
import { CustomFieldsView } from '@/components/custom-fields/view';
import type {
  CustomFieldDefinition,
  CustomFieldEntity,
} from '@/components/custom-fields/types';

interface Props {
  entityType: CustomFieldEntity;
  apiBase: string; // e.g. /leads/abc
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown> | null | undefined;
}

export function CustomFieldsCard({ entityType, apiBase, definitions, values }: Props) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>((values as Record<string, unknown>) ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = definitions.filter((d) => d.entityType === entityType && !d.archivedAt);

  if (active.length === 0) return null;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(apiBase, {
        method: 'PATCH',
        json: { customFields: draft },
      });
      toast.success('Campos guardados');
      setEditing(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo guardar';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          Campos personalizados
        </h2>
        {editing ? (
          <button type="button" className="text-xs text-ink-500" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            className="text-xs text-primary-700 hover:underline"
            onClick={() => setEditing(true)}
          >
            Editar
          </button>
        )}
      </div>
      <div className="mt-4">
        {editing ? (
          <>
            <CustomFieldsForm definitions={active} values={draft} onChange={setDraft} />
            {err && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {err}
              </div>
            )}
            <button
              type="button"
              className={buttonClass('primary', 'mt-4 text-xs')}
              onClick={save}
              disabled={busy}
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        ) : (
          <CustomFieldsView definitions={active} values={values} />
        )}
      </div>
    </Card>
  );
}
