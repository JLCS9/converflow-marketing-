/**
 * Motor de ciclo de vida DECLARATIVO (F1). Los estados y transiciones son
 * datos del tenant (LifecycleDefinition), no código: añadir un estado o una
 * regla es editar la definición, jamás desplegar.
 *
 * Semántica de `from`:
 *   - null  → solo aplica si el perfil AÚN no tiene estado (asignación inicial)
 *   - '*'   → aplica desde cualquier estado (incluido sin estado)
 *   - 'x'   → solo desde el estado x
 * Gana la PRIMERA regla que casa, en el orden declarado.
 */

export interface LifecycleRuleWhen {
  /** La transición se dispara al llegar un evento de este tipo. */
  eventType?: string;
  /** Condición sobre los campos del perfil (custom o núcleo). */
  fieldEquals?: { key: string; value: unknown };
  /**
   * Regla temporal (la evalúa el barrido, no la llegada de eventos): días sin
   * eventos — de un tipo concreto si se indica, de cualquier tipo si no.
   */
  inactivityDays?: { eventType?: string; days: number };
}

export interface LifecycleRule {
  from: string | null | '*';
  to: string;
  when: LifecycleRuleWhen;
}

export interface LifecycleDefinitionData {
  states: { key: string; label: string }[];
  transitions: LifecycleRule[];
}

export interface TransitionResult {
  to: string;
  reason: string;
}

function fromMatches(rule: LifecycleRule, current: string | null): boolean {
  if (rule.from === '*') return true;
  return rule.from === current;
}

function fieldMatches(rule: LifecycleRule, fields: Record<string, unknown>): boolean {
  if (!rule.when.fieldEquals) return true;
  return fields[rule.when.fieldEquals.key] === rule.when.fieldEquals.value;
}

/** Estado inicial de la definición (el primero declarado), si existe. */
export function initialState(def: LifecycleDefinitionData): string | null {
  return def.states[0]?.key ?? null;
}

/** Evalúa las reglas disparadas por un evento entrante. */
export function evaluateOnEvent(
  def: LifecycleDefinitionData,
  current: string | null,
  eventType: string,
  fields: Record<string, unknown> = {},
): TransitionResult | null {
  for (const rule of def.transitions) {
    if (!rule.when.eventType || rule.when.eventType !== eventType) continue;
    if (rule.when.inactivityDays) continue; // temporales: solo en el barrido
    if (!fromMatches(rule, current)) continue;
    if (!fieldMatches(rule, fields)) continue;
    if (rule.to === current) return null; // ya está ahí
    return { to: rule.to, reason: `event:${eventType}` };
  }
  return null;
}

/**
 * Evalúa las reglas temporales en el barrido diario. `lastEventAt` es el
 * último evento del perfil por tipo ('*' = de cualquier tipo).
 */
export function evaluateInactivity(
  def: LifecycleDefinitionData,
  current: string | null,
  lastEventAt: Record<string, Date | undefined>,
  now: Date,
  fields: Record<string, unknown> = {},
): TransitionResult | null {
  for (const rule of def.transitions) {
    const spec = rule.when.inactivityDays;
    if (!spec) continue;
    if (!fromMatches(rule, current)) continue;
    if (!fieldMatches(rule, fields)) continue;
    if (rule.to === current) continue;
    const last = lastEventAt[spec.eventType ?? '*'];
    const elapsedDays = last
      ? (now.getTime() - last.getTime()) / 86_400_000
      : Number.POSITIVE_INFINITY;
    if (elapsedDays >= spec.days) {
      return { to: rule.to, reason: `rule:inactivity-${spec.eventType ?? 'any'}-${spec.days}d` };
    }
  }
  return null;
}

/** Valida la coherencia de una definición (estados referenciados existen…). */
export function validateDefinition(def: LifecycleDefinitionData): string[] {
  const errors: string[] = [];
  const keys = new Set(def.states.map((s) => s.key));
  if (def.states.length === 0) errors.push('la definición necesita al menos un estado');
  for (const [i, rule] of def.transitions.entries()) {
    if (!keys.has(rule.to)) errors.push(`transición #${i}: estado destino desconocido «${rule.to}»`);
    if (rule.from && rule.from !== '*' && !keys.has(rule.from))
      errors.push(`transición #${i}: estado origen desconocido «${rule.from}»`);
    if (!rule.when.eventType && !rule.when.inactivityDays)
      errors.push(`transición #${i}: necesita eventType o inactivityDays`);
  }
  return errors;
}
