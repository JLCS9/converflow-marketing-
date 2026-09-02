import type { LifecycleDefinitionData } from '../lifecycle/lifecycle.engine.js';

/**
 * Plantillas de vertical (F1): el paquete versionado que siembra un tenant
 * nuevo — campos personalizados del perfil, máquina de estados del ciclo de
 * vida e instrucciones de ejemplo. El tenant parte de algo que funciona y lo
 * personaliza; nosotros mantenemos POCAS plantillas, no N configuraciones.
 */

export interface VerticalFieldDef {
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT' | 'MULTISELECT';
  options?: { value: string; label: string }[];
  required?: boolean;
  sensitive?: boolean;
  retentionDays?: number;
  extractable?: boolean;
  helpText?: string;
}

export interface VerticalTemplate {
  key: string;
  name: string;
  version: number;
  profileFields: VerticalFieldDef[];
  lifecycle: { name: string; definition: LifecycleDefinitionData };
  /** Reglas de la casa de ejemplo (F2 las inyecta al system prompt). */
  exampleInstructions: string[];
}

// ---------------------------------------------------------------------------
// E-LEARNING / FORMACIÓN
// ---------------------------------------------------------------------------
const ELEARNING: VerticalTemplate = {
  key: 'elearning',
  name: 'E-learning / Formación',
  version: 1,
  profileFields: [
    { key: 'curso_objetivo', label: 'Curso de interés', type: 'TEXT', extractable: true,
      helpText: 'El programa por el que pregunta el contacto.' },
    { key: 'rol_compra', label: 'Rol de compra', type: 'SELECT', extractable: true,
      options: [
        { value: 'alumno', label: 'Alumno (compra para sí)' },
        { value: 'empresa', label: 'Empresa (RRHH/manager)' },
        { value: 'prescriptor', label: 'Prescriptor' },
      ] },
    { key: 'nivel_previo', label: 'Nivel previo', type: 'SELECT', extractable: true,
      options: [
        { value: 'inicial', label: 'Inicial' },
        { value: 'intermedio', label: 'Intermedio' },
        { value: 'avanzado', label: 'Avanzado' },
      ] },
    { key: 'plazo_inicio', label: 'Cuándo quiere empezar', type: 'TEXT', extractable: true },
    { key: 'bonificable', label: 'Interesa FUNDAE', type: 'BOOLEAN', extractable: true },
  ],
  lifecycle: {
    name: 'Ciclo e-learning',
    definition: {
      states: [
        { key: 'interesado', label: 'Interesado' },
        { key: 'alumno', label: 'Alumno' },
        { key: 'dormido', label: 'Dormido' },
        { key: 'antiguo_alumno', label: 'Antiguo alumno' },
      ],
      transitions: [
        { from: null, to: 'interesado', when: { eventType: 'lead_created' } },
        { from: '*', to: 'alumno', when: { eventType: 'enrollment' } },
        { from: 'alumno', to: 'antiguo_alumno', when: { eventType: 'course_completed' } },
        { from: 'alumno', to: 'dormido', when: { inactivityDays: { eventType: 'course_activity', days: 30 } } },
        { from: 'dormido', to: 'alumno', when: { eventType: 'course_activity' } },
        { from: 'interesado', to: 'dormido', when: { inactivityDays: { days: 60 } } },
      ],
    },
  },
  exampleInstructions: [
    'Si preguntan por precios, indica el rango y ofrece agendar una llamada con admisiones.',
    'Los cursos bonificables por FUNDAE requieren comunicarlo 7 días antes del inicio: dilo siempre que pregunten por bonificación.',
    'Nunca prometas plazas: la disponibilidad la confirma admisiones.',
  ],
};

// ---------------------------------------------------------------------------
// RESIDENCIAS / SENIOR LIVING — datos sensibles y consentimiento estricto:
// los campos clínicos van con sensitive + retención corta. El interlocutor
// habitual NO es el residente sino un familiar.
// ---------------------------------------------------------------------------
const RESIDENCIAS: VerticalTemplate = {
  key: 'residencias',
  name: 'Residencias / Senior living',
  version: 1,
  profileFields: [
    { key: 'parentesco', label: 'Relación con el futuro residente', type: 'SELECT', extractable: true,
      options: [
        { value: 'hijo_a', label: 'Hijo/a' },
        { value: 'conyuge', label: 'Cónyuge' },
        { value: 'otro_familiar', label: 'Otro familiar' },
        { value: 'interesado_propio', label: 'Para sí mismo/a' },
        { value: 'trabajador_social', label: 'Trabajador/a social' },
      ] },
    { key: 'tipo_estancia', label: 'Tipo de estancia', type: 'SELECT', extractable: true,
      options: [
        { value: 'permanente', label: 'Permanente' },
        { value: 'temporal', label: 'Temporal / respiro' },
        { value: 'centro_dia', label: 'Centro de día' },
      ] },
    { key: 'nivel_dependencia', label: 'Nivel de dependencia (referido)', type: 'SELECT',
      sensitive: true, retentionDays: 365, extractable: true,
      options: [
        { value: 'autonomo', label: 'Autónomo' },
        { value: 'asistencia_parcial', label: 'Asistencia parcial' },
        { value: 'gran_dependencia', label: 'Gran dependencia' },
      ],
      helpText: 'Dato sensible: solo el que la familia comparta voluntariamente.' },
    { key: 'necesidades_medicas', label: 'Necesidades médicas mencionadas', type: 'TEXT',
      sensitive: true, retentionDays: 365, extractable: true,
      helpText: 'Dato de salud referido por la familia. Retención limitada.' },
    { key: 'ley_dependencia', label: 'Tiene grado de dependencia reconocido', type: 'BOOLEAN', extractable: true },
    { key: 'plazo_ingreso', label: 'Urgencia del ingreso', type: 'SELECT', extractable: true,
      options: [
        { value: 'inmediato', label: 'Inmediato (días)' },
        { value: 'corto', label: 'Semanas' },
        { value: 'explorando', label: 'Explorando opciones' },
      ] },
  ],
  lifecycle: {
    name: 'Ciclo residencia',
    definition: {
      states: [
        { key: 'consulta', label: 'Consulta inicial' },
        { key: 'visita_agendada', label: 'Visita agendada' },
        { key: 'valoracion', label: 'En valoración' },
        { key: 'residente', label: 'Residente' },
        { key: 'descartado', label: 'No continúa' },
      ],
      transitions: [
        { from: null, to: 'consulta', when: { eventType: 'lead_created' } },
        { from: '*', to: 'visita_agendada', when: { eventType: 'visit_scheduled' } },
        { from: '*', to: 'valoracion', when: { eventType: 'assessment_started' } },
        { from: '*', to: 'residente', when: { eventType: 'admission' } },
        { from: 'consulta', to: 'descartado', when: { inactivityDays: { days: 45 } } },
      ],
    },
  },
  exampleInstructions: [
    'El interlocutor suele ser un familiar en un momento delicado: tono cálido, sin tecnicismos y sin presión comercial.',
    'Jamás pidas diagnósticos médicos: si la familia los menciona, regístralos; si no, no preguntes por ellos.',
    'Los precios exactos dependen de la valoración: da la horquilla y ofrece la visita gratuita.',
    'Ante urgencia inmediata, prioriza el teléfono: ofrece llamada hoy mismo.',
  ],
};

export const VERTICAL_TEMPLATES: Record<string, VerticalTemplate> = {
  elearning: ELEARNING,
  residencias: RESIDENCIAS,
};
