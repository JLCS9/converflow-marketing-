'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { AGENT_TOOLS, DEFAULT_AI_DISCLOSURE } from '@converflow/shared';

const toolLabels: Record<string, string> = {
  schedule_meeting: 'Agendar reuniones (Google Calendar)',
  create_opportunity: 'Crear oportunidades',
  update_opportunity: 'Actualizar oportunidades',
  escalate_to_human: 'Escalar a una persona',
  create_support_task: 'Crear tickets de soporte',
};

// create_support_task is driven by the Soporte section toggle below, not the
// generic tools checklist, to keep its routing config in one place.
const CHECKLIST_TOOLS = AGENT_TOOLS.filter((t) => t !== 'create_support_task');

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

interface SupportRouteUI {
  topic: string;
  keywords: string; // comma-separated in the UI
  ownerId: string;
}

interface SupportConfigData {
  enabled?: boolean;
  routes?: { topic: string; keywords?: string[]; ownerId: string }[];
  fallbackOwnerId?: string;
  defaultPriority?: string;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
}

interface AgentConfig {
  language?: string;
  tone?: string;
  businessInfo?: string;
  faqs?: string;
  aiDisclosure?: string;
  tools?: string[];
  support?: SupportConfigData;
  // mode is legacy — replyMode lives on Bot now.
  mode?: 'SUGGEST' | 'AUTO';
}

// AgentType lives in @converflow/shared (15 values). Re-exported for the
// pages that import { AgentType } from this file (legacy convenience).
export type { AgentType } from '@converflow/shared';
import type { AgentType } from '@converflow/shared';

export interface AgentData {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  status: string;
  type: AgentType;
  config: AgentConfig | null;
}

// Generic skeleton for the system prompt when no template provides one.
const DEFAULT_CONVERSATIONAL_PROMPT =
  'Eres el asistente comercial de [Empresa]. Hablas en castellano, tono profesional pero cercano. Solo respondes con la información que aparece en "Información de empresa/producto" — si no lo sabes, lo dices y propones contactar con una persona.';

const DEFAULT_OPPORTUNITIES_PROMPT = [
  'Para cada lead, sigue estas reglas:',
  '',
  "- Si {field.<tu_campo_clave>} indica interés alto → statusDecision: CLIENT",
  "- Si {field.<tu_campo_clave>} indica rechazo → statusDecision: LOST",
  '- En cualquier otro caso → statusDecision: LEAD',
  '',
  'Crea oportunidad cuando:',
  '- {lead.score} ≥ 70, o',
  '- {field.<tu_otro_campo>} sea ...',
  '',
  'Nombre de la oportunidad: "{lead.name} · <descripción>"',
].join('\n');

export function AgentForm({
  agent,
  initialType,
  lockType,
  template,
}: {
  agent?: AgentData;
  initialType?: AgentType;
  /** When true the Type select doesn't render (Step 2 of the new-agent wizard
   *  has the type already committed). */
  lockType?: boolean;
  /** Wizard template that produced this form. Defaults (name, prompt, tools)
   *  + the "Plantilla X" banner come from here in Commit C. */
  template?: { id: string; label: string; defaults?: { name?: string; systemPrompt?: string; tools?: string[] } };
}) {
  const router = useRouter();
  const cfg = agent?.config ?? {};
  const [type, setType] = useState<AgentType>(agent?.type ?? initialType ?? 'CONVERSATIONAL');
  // Tools state. When the wizard sent a template that prefills some tools,
  // we honour it on a fresh form; an existing agent's saved tools always win.
  const [tools, setTools] = useState<string[]>(
    cfg.tools ?? (agent ? [] : template?.defaults?.tools ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Support / ticketing config (CONVERSATIONAL only).
  const initSupport = cfg.support ?? {};
  const [supportEnabled, setSupportEnabled] = useState<boolean>(initSupport.enabled ?? false);
  const [supportPriority, setSupportPriority] = useState<string>(
    initSupport.defaultPriority ?? 'MEDIUM',
  );
  const [fallbackOwnerId, setFallbackOwnerId] = useState<string>(initSupport.fallbackOwnerId ?? '');
  const [routes, setRoutes] = useState<SupportRouteUI[]>(
    (initSupport.routes ?? []).map((r) => ({
      topic: r.topic,
      keywords: (r.keywords ?? []).join(', '),
      ownerId: r.ownerId,
    })),
  );
  const [users, setUsers] = useState<TenantUser[]>([]);

  // Load the tenant's users for the responsible selects (only when relevant).
  useEffect(() => {
    let active = true;
    apiFetch<TenantUser[]>('/users/assignable')
      .then((u) => active && setUsers(Array.isArray(u) ? u : []))
      .catch(() => active && setUsers([]));
    return () => {
      active = false;
    };
  }, []);

  function toggleTool(t: string) {
    setTools((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]));
  }

  function addRoute() {
    setRoutes((v) => [...v, { topic: '', keywords: '', ownerId: '' }]);
  }
  function updateRoute(i: number, patch: Partial<SupportRouteUI>) {
    setRoutes((v) => v.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRoute(i: number) {
    setRoutes((v) => v.filter((_, idx) => idx !== i));
  }

  function buildSupportConfig(): SupportConfigData {
    if (!supportEnabled) return { enabled: false };
    return {
      enabled: true,
      defaultPriority: supportPriority,
      fallbackOwnerId: fallbackOwnerId || undefined,
      routes: routes
        .filter((r) => r.topic.trim() && r.ownerId)
        .map((r) => ({
          topic: r.topic.trim(),
          ownerId: r.ownerId,
          keywords: r.keywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
        })),
    };
  }

  const isConversational = type === 'CONVERSATIONAL';
  const isOpportunities = type === 'OPPORTUNITIES';
  // Tools the template marked as the "core" of this preset. Shown with a
  // small tag, but the user can still uncheck them.
  const templateCoreTools = new Set(template?.defaults?.tools ?? []);

  // System-prompt skeleton: template default wins; otherwise fall back to a
  // generic skeleton per engine.
  const systemPromptSkeleton =
    template?.defaults?.systemPrompt ??
    (isOpportunities ? DEFAULT_OPPORTUNITIES_PROMPT : DEFAULT_CONVERSATIONAL_PROMPT);
  const nameSkeleton = template?.defaults?.name ?? '';

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
            type,
            // Persist the template id only on creation; editing an agent
            // keeps the original template (or null).
            template: agent ? undefined : template?.id,
            config: isConversational
              ? {
                  language: String(f.get('language') ?? '').trim() || undefined,
                  tone: String(f.get('tone') ?? '').trim() || undefined,
                  businessInfo: String(f.get('businessInfo') ?? '').trim() || undefined,
                  faqs: String(f.get('faqs') ?? '').trim() || undefined,
                  aiDisclosure:
                    String(f.get('aiDisclosure') ?? '').trim() || DEFAULT_AI_DISCLOSURE,
                  tools,
                  support: buildSupportConfig(),
                }
              : isOpportunities
              ? {
                  defaultUpdateStatus: f.get('defaultUpdateStatus') === 'on',
                  defaultCreateOpportunities: f.get('defaultCreateOpportunities') === 'on',
                }
              : {},
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
        {/* Template banner. Surfaces "Plantilla X" + a Change-template link
            so the user always knows what preset they're editing. */}
        {template && !agent && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-primary-100 bg-primary-50/40 p-3 text-sm">
            <div>
              <div className="text-ink-900">
                Plantilla <strong>{template.label}</strong> —{' '}
                {isOpportunities
                  ? 'agente de oportunidades preconfigurado.'
                  : 'asistente conversacional preconfigurado.'}{' '}
                <span className="text-ink-500">Puedes cambiar todo.</span>
              </div>
            </div>
            <Link
              href="/app/agents/new"
              className="shrink-0 text-xs text-primary-700 hover:underline"
            >
              Cambiar tipo →
            </Link>
          </div>
        )}

        {/* Type picker — hidden when the parent already committed the type
            (Step 2 of /app/agents/new wizard). On edit we keep it visible so
            the user can re-classify an existing agent — but we only let them
            choose from the runtime-available purposes. */}
        {!lockType && (
          <Field
            label="Tipo de agente"
            required
            help="Solo se muestran los tipos que el runtime ya puede ejecutar. El resto del embudo está en construcción."
          >
            <Select value={type} onChange={(e) => setType(e.target.value as AgentType)}>
              <option value="CONVERSATIONAL">💬 Conversacional</option>
              <option value="OPPORTUNITIES">🎯 Oportunidades</option>
              <option value="UTILITY" disabled>
                ⚙️ Utilidad · próximamente
              </option>
            </Select>
          </Field>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre" required>
            <Input
              name="name"
              defaultValue={agent?.name ?? nameSkeleton}
              required
              maxLength={80}
            />
          </Field>
          <Field label="Descripción">
            <Input name="description" defaultValue={agent?.description ?? ''} maxLength={500} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Calidad de respuesta">
            <Select name="model" defaultValue={agent?.model ?? 'claude-sonnet-4-6'}>
              <option value="claude-sonnet-4-6">Estándar (más capaz)</option>
              <option value="claude-haiku-4-5-20251001">Rápida</option>
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

        {isConversational && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Idioma">
              <Input name="language" defaultValue={cfg.language ?? 'español'} maxLength={20} />
            </Field>
            <Field label="Tono">
              <Input
                name="tone"
                defaultValue={cfg.tone ?? ''}
                placeholder="profesional y cercano"
                maxLength={160}
              />
            </Field>
          </div>
        )}

        <Field
          label={
            isOpportunities
              ? 'Reglas del funnel (system prompt)'
              : 'Instrucciones del agente (system prompt)'
          }
          required
          help={
            isOpportunities
              ? 'Describe cómo categorizar tus leads y cuándo crear oportunidades. Puedes referenciar datos del lead con {lead.name}, {lead.email}, {field.<tu_campo>} (próximamente, también campos personalizados).'
              : 'Quién es el agente y cómo debe comportarse. Puedes referenciar datos del lead con {lead.name}, {lead.email}, etc.'
          }
        >
          <Textarea
            name="systemPrompt"
            rows={isOpportunities ? 8 : 6}
            required
            defaultValue={agent?.systemPrompt ?? systemPromptSkeleton}
            placeholder={systemPromptSkeleton}
          />
        </Field>

        {isConversational && (
          <>
            <Field
              label="Información de empresa / producto"
              help="El agente responde SOLO con esto (no inventa). Pega aquí lo que pueda contar."
            >
              <Textarea name="businessInfo" rows={5} defaultValue={cfg.businessInfo ?? ''} />
            </Field>

            <Field label="FAQs">
              <Textarea
                name="faqs"
                rows={4}
                defaultValue={cfg.faqs ?? ''}
                placeholder={'P: ¿Horario?\nR: L-V 9-18'}
              />
            </Field>

            <div>
              <div className="text-sm font-medium text-ink-900">Herramientas que puede usar</div>
              <p className="mb-2 text-xs text-ink-500">
                Marca las que el agente puede invocar. Las marcadas como{' '}
                <em>núcleo de esta plantilla</em> vienen pre-activadas — puedes
                desmarcarlas si no las necesitas.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHECKLIST_TOOLS.map((t) => {
                  const isCore = templateCoreTools.has(t);
                  return (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tools.includes(t)}
                        onChange={() => toggleTool(t)}
                      />
                      <span>
                        {toolLabels[t] ?? t}
                        {isCore && (
                          <span className="ml-1 text-[10px] uppercase tracking-wider text-primary-700">
                            · núcleo de esta plantilla
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Field
              label="Aviso de IA (obligatorio)"
              help="Se envía al cliente en el primer contacto. Obligatorio por normativa (AI Act)."
            >
              <Textarea
                name="aiDisclosure"
                rows={2}
                defaultValue={cfg.aiDisclosure ?? DEFAULT_AI_DISCLOSURE}
              />
            </Field>

            {/* ── Soporte / tickets ──────────────────────────────── */}
            <div className="rounded-md border border-ink-100 bg-ink-100/40 p-4 space-y-3">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={supportEnabled}
                  onChange={(e) => setSupportEnabled(e.target.checked)}
                  className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm">
                  <strong>Soporte / tickets</strong> — cuando el agente detecte una incidencia (o
                  escale a una persona), crea una tarea de soporte, la asigna al responsable y le
                  avisa por email.
                </span>
              </label>

              {supportEnabled && (
                <div className="space-y-4 border-t border-ink-100 pt-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Prioridad por defecto">
                      <Select
                        value={supportPriority}
                        onChange={(e) => setSupportPriority(e.target.value)}
                      >
                        {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="Responsable por defecto"
                      help="Recibe los tickets que no encajan en ninguna regla de tema."
                    >
                      <Select
                        value={fallbackOwnerId}
                        onChange={(e) => setFallbackOwnerId(e.target.value)}
                      >
                        <option value="">— Sin asignar —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-ink-900">Enrutado por tema</div>
                    <p className="mb-2 text-xs text-ink-500">
                      Cada regla asigna los tickets de un tema a una persona. Coincide por el tema
                      que clasifica la IA o por palabras clave en el mensaje.
                    </p>
                    <div className="space-y-2">
                      {routes.map((r, i) => (
                        <div
                          key={i}
                          className="grid items-start gap-2 rounded-md border border-ink-100 bg-white p-2 sm:grid-cols-[1fr_1.2fr_1.4fr_auto]"
                        >
                          <Input
                            placeholder="Tema (p. ej. Facturación)"
                            value={r.topic}
                            maxLength={60}
                            onChange={(e) => updateRoute(i, { topic: e.target.value })}
                          />
                          <Input
                            placeholder="Palabras clave (coma)"
                            value={r.keywords}
                            onChange={(e) => updateRoute(i, { keywords: e.target.value })}
                          />
                          <Select
                            value={r.ownerId}
                            onChange={(e) => updateRoute(i, { ownerId: e.target.value })}
                          >
                            <option value="">— Responsable —</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </Select>
                          <button
                            type="button"
                            onClick={() => removeRoute(i)}
                            className={buttonClass('ghost', 'px-2')}
                            aria-label="Eliminar regla"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addRoute}
                      className={buttonClass('secondary', 'mt-2')}
                    >
                      + Añadir regla
                    </button>
                  </div>

                  {users.length === 0 && (
                    <p className="text-xs text-amber-700">
                      No hay usuarios para asignar todavía. Invita a tu equipo en{' '}
                      <Link href="/app/users" className="underline">
                        Usuarios
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {isOpportunities && (
          <div className="rounded-md border border-ink-100 bg-ink-100/40 p-3 space-y-2 text-sm">
            <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
              Defaults para el batch
            </div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="defaultUpdateStatus"
                defaultChecked={(cfg as { defaultUpdateStatus?: boolean }).defaultUpdateStatus ?? true}
                className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <strong>Actualizar estado</strong> (Lead/Cliente/Perdido) según la decisión del agente.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="defaultCreateOpportunities"
                defaultChecked={
                  (cfg as { defaultCreateOpportunities?: boolean }).defaultCreateOpportunities ?? true
                }
                className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <strong>Crear oportunidad</strong> cuando el agente identifique interés claro.
              </span>
            </label>
            <p className="text-xs text-ink-500">
              Estos defaults solo se aplican cuando lanzas el batch desde la lista de Leads y el
              usuario no los desmarca.
            </p>
          </div>
        )}

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
