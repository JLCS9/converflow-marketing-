/**
 * Ensamblado del contexto del motor conversacional (F2). Función pura: las
 * piezas entran resueltas y sale el system prompt por secciones. El orden
 * importa para el prompt caching: lo estable (identidad + instrucciones)
 * primero; lo volátil (fuentes del turno, perfil) después.
 */
import type { ContextBlock } from '../knowledge/knowledge.service.js';

export interface EngineProfileView {
  name?: string | null;
  lifecycleState?: string | null;
  custom?: Record<string, unknown> | null;
}

const CHANNEL_RULES: Record<string, string> = {
  WEBCHAT:
    'Canal: chat web. Respuestas CORTAS (2-4 frases), directas y cercanas. Una pregunta como máximo por turno.',
  WHATSAPP:
    'Canal: WhatsApp. Respuestas breves y conversacionales, sin párrafos largos ni formato.',
  EMAIL:
    'Canal: email. Respuesta completa y estructurada, con saludo y despedida breves.',
};

export interface EngineIdentity {
  tone?: string | null;
  language?: string | null;
}

export function buildEngineSystem(opts: {
  tenantName: string;
  instructions: string[];
  blocks: ContextBlock[];
  profile: EngineProfileView | null;
  channel: string;
  extractableCount: number;
  /** E1 · Identidad del asistente (del Agent del bot): tono e idioma. */
  identity?: EngineIdentity | null;
  /** E1 · true cuando hay herramientas CRM disponibles en este turno. */
  hasTools?: boolean;
}): string {
  const parts: string[] = [];

  parts.push(
    `Eres el asistente comercial de ${opts.tenantName}. Atiendes a personas interesadas con amabilidad y precisión.`,
  );

  if (opts.identity?.tone || opts.identity?.language) {
    parts.push(
      [
        opts.identity.tone ? `Tono: ${opts.identity.tone}.` : '',
        opts.identity.language ? `Responde siempre en ${opts.identity.language}, salvo que el cliente escriba en otro idioma.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  if (opts.instructions.length) {
    parts.push(`REGLAS DE LA CASA (obligatorias):\n${opts.instructions.map((i) => `- ${i}`).join('\n')}`);
  }

  parts.push(
    [
      'CÓMO RESPONDER:',
      '- Usa EXCLUSIVAMENTE la sección FUENTES para datos del negocio (horarios, condiciones, servicios, políticas). Jamás inventes datos que no estén ahí.',
      '- Las fuentes marcadas [VERIFICADA] son respuestas aprobadas por el equipo: tienen prioridad literal sobre el resto.',
      '- Si FUENTES no cubre la pregunta, dilo con naturalidad, marca can_answer=false y ofrece que el equipo le contacte por el canal que prefiera (email o teléfono).',
      '- Nunca prometas precios, plazas o disponibilidad que no estén en FUENTES.',
      opts.hasTools
        ? '- Tienes herramientas CRM: úsalas cuando la conversación lo justifique (interés claro de compra, petición de cita, incidencia) y DESPUÉS cierra SIEMPRE el turno llamando a la herramienta `responder`.'
        : '',
      opts.extractableCount > 0
        ? `- Extrae en 'extracted' SOLO los datos que la persona diga explícitamente (hay ${opts.extractableCount} campos posibles). No preguntes en cadena: como mucho un dato por turno y solo si fluye natural.`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  parts.push(CHANNEL_RULES[opts.channel] ?? CHANNEL_RULES.WEBCHAT!);

  if (opts.blocks.length) {
    const fuentes = opts.blocks
      .map((b, i) => `[${i + 1}]${b.kind === 'verified' ? ' [VERIFICADA]' : ''} ${b.content}`)
      .join('\n---\n');
    parts.push(`FUENTES:\n${fuentes}`);
  } else {
    parts.push('FUENTES: (vacío — no hay información del negocio para esta consulta)');
  }

  if (opts.profile) {
    const known = Object.entries(opts.profile.custom ?? {})
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    parts.push(
      `PERFIL DEL CONTACTO: ${opts.profile.name ?? 'desconocido'}${
        opts.profile.lifecycleState ? ` · estado: ${opts.profile.lifecycleState}` : ''
      }${known ? ` · datos ya conocidos: ${known} (no vuelvas a preguntarlos)` : ''}`,
    );
  }

  return parts.join('\n\n');
}
