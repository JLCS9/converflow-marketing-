'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { AGENT_TOOLS, DEFAULT_AI_DISCLOSURE } from '@converflow/shared';

const toolLabels: Record<string, string> = {
  schedule_meeting: 'Agendar reuniones (Google Calendar)',
  create_opportunity: 'Crear oportunidades',
  update_opportunity: 'Actualizar oportunidades',
  escalate_to_human: 'Escalar a una persona',
};

interface AgentConfig {
  language?: string;
  tone?: string;
  businessInfo?: string;
  faqs?: string;
  aiDisclosure?: string;
  tools?: string[];
  mode?: 'SUGGEST' | 'AUTO';
}

export interface AgentData {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  status: string;
  config: AgentConfig | null;
}

export function AgentForm({ agent }: { agent?: AgentData }) {
  const router = useRouter();
  const cfg = agent?.config ?? {};
  const [tools, setTools] = useState<string[]>(cfg.tools ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleTool(t: string) {
    setTools((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]));
  }

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
            config: {
              language: String(f.get('language') ?? '').trim() || undefined,
              tone: String(f.get('tone') ?? '').trim() || undefined,
              businessInfo: String(f.get('businessInfo') ?? '').trim() || undefined,
              faqs: String(f.get('faqs') ?? '').trim() || undefined,
              aiDisclosure:
                String(f.get('aiDisclosure') ?? '').trim() || DEFAULT_AI_DISCLOSURE,
              tools,
              mode: String(f.get('mode') ?? 'SUGGEST'),
            },
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
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre" required>
            <Input name="name" defaultValue={agent?.name} required maxLength={80} />
          </Field>
          <Field label="Descripción">
            <Input name="description" defaultValue={agent?.description ?? ''} maxLength={500} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Calidad de respuesta">
            <Select name="model" defaultValue={agent?.model ?? 'claude-sonnet-4-6'}>
              <option value="claude-sonnet-4-6">Estándar (más capaz)</option>
              <option value="claude-haiku-4-5-20251001">Rápida</option>
            </Select>
          </Field>
          <Field
            label="Modo"
            help="Sugerir = una persona revisa y envía. Auto = el agente responde solo por WhatsApp (con aviso de IA). Pruébalo primero con un número de test."
          >
            <Select name="mode" defaultValue={cfg.mode ?? 'SUGGEST'}>
              <option value="SUGGEST">Sugerir (human-in-the-loop)</option>
              <option value="AUTO">Responder solo (auto)</option>
            </Select>
          </Field>
          <Field label="Estado">
            <Select name="status" defaultValue={agent?.status ?? 'DRAFT'}>
              <option value="DRAFT">Borrador</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="ARCHIVED">Archivado</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Idioma">
            <Input name="language" defaultValue={cfg.language ?? 'español'} maxLength={20} />
          </Field>
          <Field label="Tono">
            <Input name="tone" defaultValue={cfg.tone ?? ''} placeholder="profesional y cercano" maxLength={160} />
          </Field>
        </div>

        <Field label="Instrucciones (system prompt)" required help="Quién es el agente y cómo debe comportarse.">
          <Textarea name="systemPrompt" rows={4} required defaultValue={agent?.systemPrompt ?? ''} />
        </Field>

        <Field
          label="Información de empresa / producto"
          help="El agente responde SOLO con esto (no inventa). Pega aquí lo que pueda contar."
        >
          <Textarea name="businessInfo" rows={5} defaultValue={cfg.businessInfo ?? ''} />
        </Field>

        <Field label="FAQs">
          <Textarea name="faqs" rows={4} defaultValue={cfg.faqs ?? ''} placeholder={'P: ¿Horario?\nR: L-V 9-18'} />
        </Field>

        <div>
          <div className="text-sm font-medium text-ink-900">Herramientas que puede usar</div>
          <p className="mb-2 text-xs text-ink-500">La ejecución real se activa en la siguiente fase.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {AGENT_TOOLS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={tools.includes(t)} onChange={() => toggleTool(t)} />
                {toolLabels[t] ?? t}
              </label>
            ))}
          </div>
        </div>

        <Field
          label="Aviso de IA (obligatorio)"
          help="Se envía al cliente en el primer contacto. Obligatorio por normativa (AI Act)."
        >
          <Textarea name="aiDisclosure" rows={2} defaultValue={cfg.aiDisclosure ?? DEFAULT_AI_DISCLOSURE} />
        </Field>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push('/app/agents')} className={buttonClass('secondary')} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Guardando…' : agent ? 'Guardar cambios' : 'Crear agente'}
          </button>
        </div>
      </form>
    </Card>
  );
}
