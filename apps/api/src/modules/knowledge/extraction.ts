/**
 * Extracción estructurada GENERADA desde las definiciones de campos (F2).
 *
 * El motor conversacional no tiene esquema fijo: el JSON que el LLM rellena
 * durante la conversación se construye desde las CustomFieldDefinition del
 * tenant marcadas `extractable`. Añadir un campo en el panel cambia lo que
 * el bot captura — sin tocar código. Esta función es la promesa
 * multi-vertical hecha ejecutable.
 */

export interface ExtractableFieldDef {
  key: string;
  label: string;
  type: string; // CustomFieldType
  helpText?: string | null;
  options?: { value: string; label: string }[] | null;
}

/** JSON Schema del tool de extracción para un conjunto de definiciones. */
export function buildExtractionSchema(defs: ExtractableFieldDef[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const def of defs) {
    const base: Record<string, unknown> = {
      description: `${def.label}${def.helpText ? ` — ${def.helpText}` : ''}. Solo si la persona lo ha dicho EXPLÍCITAMENTE; si no, omite el campo.`,
    };
    switch (def.type) {
      case 'NUMBER':
        properties[def.key] = { ...base, type: 'number' };
        break;
      case 'BOOLEAN':
        properties[def.key] = { ...base, type: 'boolean' };
        break;
      case 'DATE':
        properties[def.key] = { ...base, type: 'string', format: 'date' };
        break;
      case 'SELECT':
        properties[def.key] = {
          ...base,
          type: 'string',
          enum: (def.options ?? []).map((o) => o.value),
        };
        break;
      case 'MULTISELECT':
        properties[def.key] = {
          ...base,
          type: 'array',
          items: { type: 'string', enum: (def.options ?? []).map((o) => o.value) },
        };
        break;
      default: // TEXT, LONGTEXT, EMAIL, PHONE, URL
        properties[def.key] = { ...base, type: 'string' };
    }
  }
  return {
    type: 'object',
    properties,
    // Nada es obligatorio: extraer solo lo dicho, jamás inventar.
    required: [],
  };
}

/**
 * Filtra la salida del LLM contra las definiciones: claves desconocidas
 * fuera, enums fuera de rango fuera, vacíos fuera. La validación de tipos
 * fina la hace CustomFieldsService.validateValues al persistir.
 */
export function sanitizeExtraction(
  defs: ExtractableFieldDef[],
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const def = byKey.get(key);
    if (!def) continue;
    if (value === null || value === undefined || value === '') continue;
    if (def.type === 'SELECT') {
      const allowed = new Set((def.options ?? []).map((o) => o.value));
      if (typeof value !== 'string' || !allowed.has(value)) continue;
    }
    if (def.type === 'MULTISELECT') {
      if (!Array.isArray(value)) continue;
      const allowed = new Set((def.options ?? []).map((o) => o.value));
      const filtered = value.filter((v) => typeof v === 'string' && allowed.has(v));
      if (filtered.length === 0) continue;
      out[key] = filtered;
      continue;
    }
    out[key] = value;
  }
  return out;
}
