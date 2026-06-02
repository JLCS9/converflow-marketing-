'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
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

const DEFAULT_OPPORTUNITIES_PROMPT = [
  'Para cada lead, sigue estas reglas:',
  '',
  "- Si {field.<tu_campo_clave>} indica interés alto → estado: CLIENT",
  "- Si {field.<tu_campo_clave>} indica rechazo → estado: LOST",
  '- En cualquier otro caso → estado: LEAD',
  '',
  'Devuelve un score (0-100) según probabilidad de cierre. Puedes referenciar',
  'datos del lead con {lead.name}, {lead.email}, {field.<tu_campo>} (próximamente,',
  'también campos personalizados).',
].join('\n');

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
  const router = useRouter();
  const cfg = agent?.config ?? {};

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
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        {/* Template banner. */}
        {template && !agent && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-primary-100 bg-primary-50/40 p-3 text-sm">
            <div className="text-ink-900">
              Plantilla <strong>{template.label}</strong> — agente de oportunidades
              preconfigurado. <span className="text-ink-500">Puedes cambiar todo.</span>
            </div>
            <Link
              href="/app/agents/new"
              className="shrink-0 text-xs text-primary-700 hover:underline"
            >
              Cambiar tipo →
            </Link>
          </div>
        )}

        {/* Identificación */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre" required>
            <Input
              name="name"
              defaultValue={agent?.name ?? template?.defaults?.name ?? ''}
              required
              maxLength={80}
            />
          </Field>
          <Field label="Descripción">
            <Input
              name="description"
              defaultValue={agent?.description ?? ''}
              maxLength={500}
            />
          </Field>
        </div>

        <Field label="Estado">
          <Select name="status" defaultValue={agent?.status ?? 'DRAFT'}>
            <option value="DRAFT">Borrador</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="ARCHIVED">Archivado</option>
          </Select>
        </Field>

        {/* Fuente de leads */}
        <Field
          label="Fuente de leads"
          help="De dónde recibirá los leads este agente para puntuarlos."
        >
          <Select name="leadSource" defaultValue={cfg.leadSource ?? 'IMPORT'}>
            <option value="IMPORT">📥 Importación (CSV / migraciones)</option>
            <option value="AUTOMATIC">⚡ Automático (canales entrantes)</option>
          </Select>
        </Field>

        {/* Reglas de puntuación */}
        <Field
          label="Reglas de puntuación (system prompt)"
          required
          help="Escribe en lenguaje natural cómo se puntúa un lead y cómo se categoriza. La IA usará estas reglas para cada lead."
        >
          <Textarea
            name="systemPrompt"
            rows={8}
            required
            defaultValue={
              agent?.systemPrompt ??
              template?.defaults?.systemPrompt ??
              DEFAULT_OPPORTUNITIES_PROMPT
            }
            placeholder={
              template?.defaults?.systemPrompt ?? DEFAULT_OPPORTUNITIES_PROMPT
            }
          />
        </Field>

        {/* Mapeo score → estado */}
        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Mapeo score → estado
          </div>
          <p className="text-xs text-ink-500">
            Convierte el score numérico que da la IA en el estado del lead.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Score ≥ X → Cliente"
              help="Score igual o mayor a este número marca el lead como Cliente."
            >
              <Input
                type="number"
                name="thresholdClient"
                min={0}
                max={100}
                defaultValue={cfg.thresholdClient ?? 70}
              />
            </Field>
            <Field
              label="Score ≤ Y → Perdido"
              help="Score igual o menor a este número marca el lead como Perdido."
            >
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
            Los leads entre ambos umbrales se quedan como <em>Lead</em>.
          </p>
        </div>

        {/* Acciones al puntuar */}
        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Acciones al puntuar
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="actionOpenOpportunity"
              defaultChecked={cfg.actionOpenOpportunity ?? true}
              className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              <strong>Abrir oportunidad</strong> en el tablero por defecto cuando el agente
              identifique interés claro.
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
              <strong>Asignar responsable</strong> al lead/oportunidad según las reglas
              que tengas configuradas.
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
              <strong>Crear tarea si supera el umbral.</strong> Score{' '}
              <input
                type="number"
                name="actionCreateTaskAboveValue"
                min={0}
                max={100}
                defaultValue={cfg.actionCreateTaskAbove ?? 75}
                disabled={!createTaskEnabled}
                className="mx-1 inline-block w-16 rounded-md border border-ink-300 px-2 py-0.5 text-sm disabled:bg-ink-100"
              />{' '}
              o superior → tarea para el responsable.
            </span>
          </label>
        </div>

        {/* Vigilancia */}
        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Vigilancia
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={watcherEnabled}
              onChange={(e) => setWatcherEnabled(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="flex-1">
              <strong>Crear tarea si una oportunidad lleva sin actividad</strong>{' '}
              <input
                type="number"
                name="watcherDaysWithoutActivityValue"
                min={1}
                max={365}
                defaultValue={cfg.watcherDaysWithoutActivity ?? 7}
                disabled={!watcherEnabled}
                className="mx-1 inline-block w-16 rounded-md border border-ink-300 px-2 py-0.5 text-sm disabled:bg-ink-100"
              />{' '}
              días o más.
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
            Cancelar
          </button>
          <button
            type="submit"
            className={buttonClass('primary')}
            disabled={pending}
          >
            {pending ? 'Guardando…' : agent ? 'Guardar cambios' : 'Crear agente'}
          </button>
        </div>
      </form>
    </Card>
  );
}
