/**
 * Source of truth for the 12 wizard "templates" — the funnel tiles the
 * user sees on /app/agents/new. Each tile maps to ONE of the three
 * persisted engines (CONVERSATIONAL / OPPORTUNITIES / UTILITY).
 *
 * `id` is what gets persisted in Agent.template and what goes in the URL
 * (?template=conversacional). `available` controls whether the card is
 * clickable; non-available cards just show a "Próximamente" tooltip and
 * never open a form.
 */
import type { AgentType } from '@converflow/shared';

export type AgentEngine = AgentType;
export type FunnelStage = 'CALIFICAR' | 'VENDER' | 'FIDELIZAR' | 'TRANSVERSAL';
export type AgentFamily = 'PEOPLE' | 'DECIDE' | 'DATA';

export interface AgentTemplate {
  id: string;
  label: string;
  /** Two- to four-word "what it does" used as the card tagline. */
  subtitle: string;
  engine: AgentEngine;
  funnelStage: FunnelStage;
  family: AgentFamily;
  available: boolean;
  /** Prefill for the form. The engine decides which fields it consumes. */
  defaults: {
    name?: string;
    systemPrompt?: string;
    tools?: string[];
  };
}

const PROMPT_CONVERSATIONAL = [
  'Eres el asistente comercial de [Empresa].',
  '',
  'Hablas en castellano, tono profesional pero cercano. Solo respondes con',
  'la información que aparece en "Información de empresa / producto". Si no',
  'lo sabes, lo dices con honestidad y propones contactar con una persona.',
  '',
  'Puedes referenciar datos del lead con {lead.name}, {lead.email}, etc.',
].join('\n');

const PROMPT_AGENDA = [
  'Eres el asistente comercial de [Empresa]. Tu objetivo es agendar una',
  'reunión cuando el lead muestra interés en uno de nuestros productos o',
  'servicios.',
  '',
  'Dispara la propuesta de reunión cuando:',
  '- El lead menciona explícitamente un producto/servicio.',
  '- El lead pide hablar / llamar / quedar.',
  '',
  'Flujo: identifica el producto → propón dos huecos del calendario → ',
  'confirma email → agenda. Si no tenemos email, pídelo educadamente',
  'antes de cerrar.',
].join('\n');

const PROMPT_OPPORTUNITIES = [
  'Para cada lead, sigue estas reglas:',
  '',
  '- Si {field.<tu_campo_clave>} indica interés alto → statusDecision: CLIENT',
  '- Si {field.<tu_campo_clave>} indica rechazo → statusDecision: LOST',
  '- En cualquier otro caso → statusDecision: LEAD',
  '',
  'Crea oportunidad cuando:',
  '- {lead.score} ≥ 70, o',
  '- {field.<tu_otro_campo>} sea …',
  '',
  'Nombre de la oportunidad: "{lead.name} · <descripción>"',
].join('\n');

export const AGENT_TEMPLATES: AgentTemplate[] = [
  // ── Calificar ──────────────────────────────────────────────────────
  {
    id: 'triage',
    label: 'Triage',
    subtitle: 'Clasifica y rutea',
    engine: 'CONVERSATIONAL',
    funnelStage: 'CALIFICAR',
    family: 'DECIDE',
    available: false,
    defaults: {},
  },
  {
    id: 'oportunidades',
    label: 'Oportunidades',
    subtitle: 'Puntúa y abre',
    engine: 'OPPORTUNITIES',
    funnelStage: 'CALIFICAR',
    family: 'DECIDE',
    available: true,
    defaults: {
      name: 'Agente de oportunidades',
      systemPrompt: PROMPT_OPPORTUNITIES,
    },
  },
  {
    id: 'enriquecimiento',
    label: 'Enriquecimiento',
    subtitle: 'Completa datos',
    engine: 'UTILITY',
    funnelStage: 'CALIFICAR',
    family: 'DATA',
    available: false,
    defaults: {},
  },

  // ── Vender ─────────────────────────────────────────────────────────
  {
    id: 'conversacional',
    label: 'Conversacional',
    subtitle: 'Conversa en canales',
    engine: 'CONVERSATIONAL',
    funnelStage: 'VENDER',
    family: 'PEOPLE',
    available: true,
    defaults: {
      name: 'Asistente conversacional',
      systemPrompt: PROMPT_CONVERSATIONAL,
      tools: [],
    },
  },
  {
    id: 'agenda',
    label: 'Agenda',
    subtitle: 'Propone y agenda',
    engine: 'CONVERSATIONAL',
    funnelStage: 'VENDER',
    family: 'PEOPLE',
    available: true,
    defaults: {
      name: 'Asistente con agenda',
      systemPrompt: PROMPT_AGENDA,
      tools: ['schedule_meeting'],
    },
  },
  {
    id: 'seguimiento',
    label: 'Seguimiento',
    subtitle: 'Sigue a tiempo',
    engine: 'CONVERSATIONAL',
    funnelStage: 'VENDER',
    family: 'PEOPLE',
    available: false,
    defaults: {},
  },

  // ── Fidelizar ──────────────────────────────────────────────────────
  {
    id: 'onboarding',
    label: 'Onboarding',
    subtitle: 'Primeros días',
    engine: 'CONVERSATIONAL',
    funnelStage: 'FIDELIZAR',
    family: 'PEOPLE',
    available: false,
    defaults: {},
  },
  {
    id: 'soporte',
    label: 'Soporte',
    subtitle: 'Resuelve y escala',
    engine: 'CONVERSATIONAL',
    funnelStage: 'FIDELIZAR',
    family: 'PEOPLE',
    available: false,
    defaults: {},
  },
  {
    id: 'reactivacion',
    label: 'Reactivación',
    subtitle: 'Recupera inactivos',
    engine: 'CONVERSATIONAL',
    funnelStage: 'FIDELIZAR',
    family: 'PEOPLE',
    available: false,
    defaults: {},
  },

  // ── Transversal ────────────────────────────────────────────────────
  {
    id: 'limpieza',
    label: 'Limpieza de datos',
    subtitle: 'Normaliza y dedup.',
    engine: 'UTILITY',
    funnelStage: 'TRANSVERSAL',
    family: 'DATA',
    available: false,
    defaults: {},
  },
  {
    id: 'informes',
    label: 'Informes',
    subtitle: 'Comercial, marketing',
    engine: 'UTILITY',
    funnelStage: 'TRANSVERSAL',
    family: 'DATA',
    available: false,
    defaults: {},
  },
  {
    id: 'resumenes',
    label: 'Resúmenes',
    subtitle: 'Charlas y reuniones',
    engine: 'UTILITY',
    funnelStage: 'TRANSVERSAL',
    family: 'DATA',
    available: false,
    defaults: {},
  },
];

// ── Presentational metadata ────────────────────────────────────────
export const FUNNEL_STAGE_META: Record<FunnelStage, { label: string }> = {
  CALIFICAR: { label: 'Calificar' },
  VENDER: { label: 'Vender' },
  FIDELIZAR: { label: 'Fidelizar' },
  TRANSVERSAL: { label: 'Soporte interno · transversal' },
};

export const VISIBLE_STAGES: FunnelStage[] = ['CALIFICAR', 'VENDER', 'FIDELIZAR'];

export const FAMILY_META: Record<
  AgentFamily,
  { label: string; accent: string; chipBg: string; chipText: string }
> = {
  PEOPLE: {
    label: 'Habla con la gente',
    accent: 'border-l-emerald-600',
    chipBg: 'bg-emerald-50',
    chipText: 'text-emerald-700',
  },
  DECIDE: {
    label: 'Puntúa y decide',
    accent: 'border-l-amber-600',
    chipBg: 'bg-amber-50',
    chipText: 'text-amber-700',
  },
  DATA: {
    label: 'Utilidades de datos',
    accent: 'border-l-ink-400',
    chipBg: 'bg-ink-100',
    chipText: 'text-ink-700',
  },
};

// ── Helpers ───────────────────────────────────────────────────────
export function findTemplate(id: string | undefined | null): AgentTemplate | undefined {
  if (!id) return undefined;
  return AGENT_TEMPLATES.find((t) => t.id === id);
}

/** Group by funnel stage for the wizard grid (transversal handled separately). */
export function templatesByStage(): Record<FunnelStage, AgentTemplate[]> {
  return AGENT_TEMPLATES.reduce(
    (acc, t) => {
      acc[t.funnelStage].push(t);
      return acc;
    },
    {
      CALIFICAR: [] as AgentTemplate[],
      VENDER: [] as AgentTemplate[],
      FIDELIZAR: [] as AgentTemplate[],
      TRANSVERSAL: [] as AgentTemplate[],
    },
  );
}
