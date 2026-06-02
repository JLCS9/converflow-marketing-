'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import { LEAD_STATUS_OPTIONS } from '@/lib/labels';

export function LeadActions({
  leadId,
  leadName,
  currentStatus,
}: {
  leadId: string;
  /** Used in the GDPR confirmation prompt so the operator sees exactly who they are erasing. */
  leadName?: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [status, setStatus] = useState<string>(currentStatus);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label className="flex flex-col text-sm">
          <span className="text-xs text-ink-500">Cambiar estado</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {LEAD_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          disabled={pending || status === currentStatus}
          onClick={() => {
            startTransition(async () => {
              try {
                await apiFetch(`/leads/${leadId}`, { method: 'PATCH', json: { status } });
                toast.success('Status actualizado');
                router.refresh();
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar');
              }
            });
          }}
          className={buttonClass('primary')}
        >
          {pending ? 'Guardando…' : 'Aplicar'}
        </button>
      </div>

      <div className="border-t border-ink-100 pt-4">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: `Eliminar permanentemente${leadName ? ` "${leadName}"` : ' este lead'}`,
              description: (
                <div className="space-y-3">
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <strong>Esta acción es irreversible.</strong> Se procesa como una
                    solicitud de supresión y borra los datos sin posibilidad de
                    recuperación.
                  </div>
                  <p>Se eliminarán de forma permanente:</p>
                  <ul className="ml-4 list-disc space-y-1 text-xs text-ink-700">
                    <li>Los datos identificativos del lead (nombre, email, teléfono).</li>
                    <li>Sus campos personalizados.</li>
                    <li>Notas, tareas y documentos asociados.</li>
                    <li>Oportunidades vinculadas a este contacto.</li>
                    <li>Conversaciones y mensajes recibidos en cualquier canal.</li>
                  </ul>
                  <p className="text-xs text-ink-500">
                    El registro de auditoría de la cuenta conserva una entrada técnica de
                    esta supresión sin datos personales, conforme al artículo 17 del RGPD.
                  </p>
                </div>
              ),
              confirmLabel: 'Eliminar permanentemente',
              cancelLabel: 'Cancelar',
              danger: true,
            });
            if (!ok) return;
            startTransition(async () => {
              try {
                await apiFetch(`/leads/${leadId}`, { method: 'DELETE' });
                toast.success('Lead eliminado permanentemente');
                router.replace('/app/leads');
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar');
              }
            });
          }}
          className={buttonClass('danger')}
        >
          Eliminar lead
        </button>
        <p className="mt-2 text-xs text-ink-500">
          La eliminación es definitiva y no se puede deshacer. Cumple con el derecho de
          supresión del RGPD (art. 17).
        </p>
      </div>
    </div>
  );
}
