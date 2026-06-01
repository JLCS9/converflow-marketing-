/**
 * Frontend catalog of agent purposes (the 15 funnel pieces).
 * Drives the wizard grid on /app/agents/new + filtering / labels across the
 * app. Mirrors AGENT_TYPE_STATUS in @converflow/shared but adds
 * presentation-only metadata.
 */
import { AGENT_TYPE_STATUS, type AgentType } from '@converflow/shared';

export type AgentGroup = 'CAPTAR' | 'CALIFICAR' | 'VENDER' | 'FIDELIZAR' | 'TRANSVERSAL';

export interface AgentPurposeMeta {
  type: AgentType;
  group: AgentGroup;
  label: string;
  /** One-line "what this agent does", shown on the wizard cards. */
  blurb: string;
  /** Emoji shown on the card (optional). */
  icon?: string;
}

export const AGENT_PURPOSES: AgentPurposeMeta[] = [
  // ---- Captar ----
  {
    type: 'CONTENT',
    group: 'CAPTAR',
    label: 'Contenido',
    blurb: 'Genera contenidos para tu blog, redes y newsletters.',
    icon: '✍️',
  },
  {
    type: 'CAMPAIGNS',
    group: 'CAPTAR',
    label: 'Campañas',
    blurb: 'Diseña y ejecuta campañas de captación coherentes.',
    icon: '📣',
  },
  {
    type: 'PROSPECTING',
    group: 'CAPTAR',
    label: 'Prospección',
    blurb: 'Encuentra leads que encajan con tu cliente ideal.',
    icon: '🔭',
  },
  // ---- Calificar ----
  {
    type: 'TRIAGE',
    group: 'CALIFICAR',
    label: 'Triage',
    blurb: 'Clasifica mensajes entrantes y los reenvía al responsable.',
    icon: '🧭',
  },
  {
    type: 'SCORING',
    group: 'CALIFICAR',
    label: 'Scoring',
    blurb: 'Puntúa leads, decide su estado y abre oportunidades en masa.',
    icon: '🎯',
  },
  {
    type: 'ENRICHMENT',
    group: 'CALIFICAR',
    label: 'Enriquecimiento',
    blurb: 'Completa datos de leads y empresas con fuentes públicas.',
    icon: '✨',
  },
  // ---- Vender ----
  {
    type: 'CONVERSATIONAL',
    group: 'VENDER',
    label: 'Conversacional',
    blurb: 'Conversa con leads y clientes en los canales del Bot.',
    icon: '💬',
  },
  {
    type: 'FOLLOW_UP',
    group: 'VENDER',
    label: 'Seguimiento',
    blurb: 'Hace seguimientos en el momento justo, sin perder oportunidades.',
    icon: '⏰',
  },
  {
    type: 'AGENDA_PROPOSAL',
    group: 'VENDER',
    label: 'Agenda + propuesta',
    blurb: 'Detecta intención, propone huecos del calendario y agenda reuniones.',
    icon: '📅',
  },
  // ---- Fidelizar ----
  {
    type: 'ONBOARDING',
    group: 'FIDELIZAR',
    label: 'Onboarding',
    blurb: 'Acompaña al cliente en sus primeros días con tu producto.',
    icon: '🤝',
  },
  {
    type: 'SUPPORT',
    group: 'FIDELIZAR',
    label: 'Soporte',
    blurb: 'Resuelve dudas con tu información y escala lo difícil.',
    icon: '🛟',
  },
  {
    type: 'REACTIVATION',
    group: 'FIDELIZAR',
    label: 'Reactivación',
    blurb: 'Recupera clientes inactivos con razones relevantes.',
    icon: '🔁',
  },
  // ---- Transversal ----
  {
    type: 'DATA_CLEANUP',
    group: 'TRANSVERSAL',
    label: 'Limpieza de datos',
    blurb: 'Normaliza, deduplica y completa registros del CRM.',
    icon: '🧹',
  },
  {
    type: 'REPORTS',
    group: 'TRANSVERSAL',
    label: 'Informes',
    blurb: 'Genera informes de comercial, marketing y soporte.',
    icon: '📊',
  },
  {
    type: 'SUMMARIES',
    group: 'TRANSVERSAL',
    label: 'Resúmenes',
    blurb: 'Resume conversaciones, reuniones y documentos largos.',
    icon: '📝',
  },
];

export const AGENT_GROUP_META: Record<AgentGroup, { label: string; description: string }> = {
  CAPTAR: { label: 'Captar', description: 'Atraer leads nuevos.' },
  CALIFICAR: { label: 'Calificar', description: 'Clasificar y priorizar.' },
  VENDER: { label: 'Vender', description: 'Cerrar negocio.' },
  FIDELIZAR: { label: 'Fidelizar', description: 'Cuidar y reactivar clientes.' },
  TRANSVERSAL: { label: 'Soporte interno · transversal', description: 'Apoya a todos los equipos.' },
};

export const FUNNEL_GROUPS: AgentGroup[] = ['CAPTAR', 'CALIFICAR', 'VENDER', 'FIDELIZAR'];

export function purposeMeta(type: AgentType | string): AgentPurposeMeta | undefined {
  return AGENT_PURPOSES.find((p) => p.type === type);
}

export function isAvailable(type: AgentType): boolean {
  return AGENT_TYPE_STATUS[type] === 'available';
}
