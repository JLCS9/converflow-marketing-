
/**
 * Mapas de etiquetas de estado TRADUCIDOS, con la misma forma que los
 * antiguos const de lib/labels.ts — statusLabel(map, value) sigue funcionando
 * igual; solo cambia el origen del mapa (diccionario del idioma activo).
 * Los mapas de color siguen en lib/labels.ts: el color no se traduce.
 */

export interface LabelMaps {
  LEAD_STATUS: Record<string, string>;
  CLIENT_STATUS: Record<string, string>;
  OPP_STATUS: Record<string, string>;
  BOT_STATUS: Record<string, string>;
  AGENT_STATUS: Record<string, string>;
  TASK_STATUS: Record<string, string>;
  TASK_TYPE: Record<string, string>;
  PRIORITY: Record<string, string>;
  CHANNEL: Record<string, string>;
  NOTE_CATEGORY: Record<string, string>;
  /** Los tres estados reales de lead para formularios/filtros (sin alias legacy). */
  LEAD_STATUS_OPTIONS: { value: 'LEAD' | 'CLIENT' | 'LOST'; label: string }[];
}

export function labelMapsFrom(messages: unknown): LabelMaps {
  const l = ((messages as { labels?: Record<string, Record<string, string>> }).labels ??
    {}) as Record<string, Record<string, string>>;
  const leadStatus = l.leadStatus ?? {};
  return {
    LEAD_STATUS: leadStatus,
    CLIENT_STATUS: l.clientStatus ?? {},
    OPP_STATUS: l.oppStatus ?? {},
    BOT_STATUS: l.botStatus ?? {},
    AGENT_STATUS: l.agentStatus ?? {},
    TASK_STATUS: l.taskStatus ?? {},
    TASK_TYPE: l.taskType ?? {},
    PRIORITY: l.priority ?? {},
    CHANNEL: l.channel ?? {},
    NOTE_CATEGORY: l.noteCategory ?? {},
    LEAD_STATUS_OPTIONS: (['LEAD', 'CLIENT', 'LOST'] as const).map((value) => ({
      value,
      label: leadStatus[value] ?? value,
    })),
  };
}
