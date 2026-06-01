/**
 * Frontend catalog of agent purposes (the 12 funnel pieces).
 * Drives the wizard grid on /app/agents/new + filtering / labels across the
 * app. Mirrors AGENT_TYPE_STATUS in @converflow/shared.
 *
 * Layout in the wizard is by funnel stage (column), but each card is tinted
 * by its *family* — what kind of work it does:
 *   PEOPLE  → "habla con la gente"     · emerald
 *   DECIDE  → "puntúa y decide"        · amber
 *   DATA    → "utilidades de datos"    · ink
 */
import { AGENT_TYPE_STATUS, type AgentType } from '@converflow/shared';

export type AgentGroup = 'CALIFICAR' | 'VENDER' | 'FIDELIZAR' | 'TRANSVERSAL';
export type AgentFamily = 'PEOPLE' | 'DECIDE' | 'DATA';

export interface AgentPurposeMeta {
  type: AgentType;
  group: AgentGroup;
  family: AgentFamily;
  label: string;
  /** Two- to four-word "what it does" used as the card tagline. */
  blurb: string;
}

export const AGENT_PURPOSES: AgentPurposeMeta[] = [
  // ---- Calificar ----
  { type: 'TRIAGE',     group: 'CALIFICAR', family: 'DECIDE', label: 'Triage',         blurb: 'Clasifica y rutea' },
  { type: 'SCORING',    group: 'CALIFICAR', family: 'DECIDE', label: 'Oportunidades',  blurb: 'Puntúa y abre' },
  { type: 'ENRICHMENT', group: 'CALIFICAR', family: 'DATA',   label: 'Enriquecimiento', blurb: 'Completa datos' },
  // ---- Vender ----
  { type: 'CONVERSATIONAL',  group: 'VENDER', family: 'PEOPLE', label: 'Conversacional', blurb: 'Conversa en canales' },
  { type: 'AGENDA_PROPOSAL', group: 'VENDER', family: 'PEOPLE', label: 'Agenda',         blurb: 'Propone y agenda' },
  { type: 'FOLLOW_UP',       group: 'VENDER', family: 'PEOPLE', label: 'Seguimiento',    blurb: 'Sigue a tiempo' },
  // ---- Fidelizar ----
  { type: 'ONBOARDING',   group: 'FIDELIZAR', family: 'PEOPLE', label: 'Onboarding',   blurb: 'Primeros días' },
  { type: 'SUPPORT',      group: 'FIDELIZAR', family: 'PEOPLE', label: 'Soporte',      blurb: 'Resuelve y escala' },
  { type: 'REACTIVATION', group: 'FIDELIZAR', family: 'PEOPLE', label: 'Reactivación', blurb: 'Recupera inactivos' },
  // ---- Transversal ----
  { type: 'DATA_CLEANUP', group: 'TRANSVERSAL', family: 'DATA', label: 'Limpieza de datos', blurb: 'Normaliza y dedup.' },
  { type: 'REPORTS',      group: 'TRANSVERSAL', family: 'DATA', label: 'Informes',          blurb: 'Comercial, marketing' },
  { type: 'SUMMARIES',    group: 'TRANSVERSAL', family: 'DATA', label: 'Resúmenes',         blurb: 'Charlas y reuniones' },
];

export const AGENT_GROUP_META: Record<AgentGroup, { label: string }> = {
  CALIFICAR: { label: 'Calificar' },
  VENDER: { label: 'Vender' },
  FIDELIZAR: { label: 'Fidelizar' },
  TRANSVERSAL: { label: 'Soporte interno · transversal' },
};

export const FUNNEL_GROUPS: AgentGroup[] = ['CALIFICAR', 'VENDER', 'FIDELIZAR'];

export const FAMILY_META: Record<AgentFamily, { label: string; accent: string; chipBg: string; chipText: string }> = {
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

export function purposeMeta(type: AgentType | string): AgentPurposeMeta | undefined {
  return AGENT_PURPOSES.find((p) => p.type === type);
}

export function isAvailable(type: AgentType): boolean {
  return AGENT_TYPE_STATUS[type] === 'available';
}
