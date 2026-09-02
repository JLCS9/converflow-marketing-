import { describe, expect, it } from 'vitest';
import {
  evaluateInactivity,
  evaluateOnEvent,
  initialState,
  validateDefinition,
  type LifecycleDefinitionData,
} from './lifecycle.engine.js';

/** Plantilla de e-learning simplificada, como la usará el vertical real. */
const DEF: LifecycleDefinitionData = {
  states: [
    { key: 'interesado', label: 'Interesado' },
    { key: 'alumno', label: 'Alumno' },
    { key: 'dormido', label: 'Dormido' },
    { key: 'reactivado', label: 'Reactivado' },
  ],
  transitions: [
    { from: null, to: 'interesado', when: { eventType: 'lead_created' } },
    { from: '*', to: 'alumno', when: { eventType: 'enrollment' } },
    { from: 'alumno', to: 'dormido', when: { inactivityDays: { eventType: 'course_activity', days: 90 } } },
    { from: 'dormido', to: 'reactivado', when: { eventType: 'course_activity' } },
    { from: 'interesado', to: 'dormido', when: { inactivityDays: { days: 60 } } },
  ],
};

const d = (iso: string) => new Date(iso);

describe('lifecycle engine', () => {
  it('la definición de ejemplo es válida y el estado inicial es el primero', () => {
    expect(validateDefinition(DEF)).toEqual([]);
    expect(initialState(DEF)).toBe('interesado');
  });

  it('asignación inicial: from=null solo aplica sin estado previo', () => {
    expect(evaluateOnEvent(DEF, null, 'lead_created')).toEqual({
      to: 'interesado',
      reason: 'event:lead_created',
    });
    expect(evaluateOnEvent(DEF, 'alumno', 'lead_created')).toBeNull();
  });

  it("from='*' transiciona desde cualquier estado, incluido sin estado", () => {
    expect(evaluateOnEvent(DEF, null, 'enrollment')?.to).toBe('alumno');
    expect(evaluateOnEvent(DEF, 'dormido', 'enrollment')?.to).toBe('alumno');
  });

  it('no transiciona al estado en el que ya está', () => {
    expect(evaluateOnEvent(DEF, 'alumno', 'enrollment')).toBeNull();
  });

  it('las reglas temporales no se disparan con eventos', () => {
    expect(evaluateOnEvent(DEF, 'alumno', 'course_activity')).toBeNull();
  });

  it('el barrido aplica inactividad por tipo de evento', () => {
    const now = d('2026-06-01T00:00:00Z');
    expect(
      evaluateInactivity(DEF, 'alumno', { course_activity: d('2026-01-01T00:00:00Z') }, now),
    ).toEqual({ to: 'dormido', reason: 'rule:inactivity-course_activity-90d' });
    // actividad reciente → no cae
    expect(
      evaluateInactivity(DEF, 'alumno', { course_activity: d('2026-05-20T00:00:00Z') }, now),
    ).toBeNull();
  });

  it('sin ningún evento registrado, la inactividad cuenta como infinita', () => {
    expect(evaluateInactivity(DEF, 'alumno', {}, d('2026-06-01T00:00:00Z'))?.to).toBe('dormido');
  });

  it("inactividad sin tipo usa el último evento de cualquier tipo ('*')", () => {
    const now = d('2026-06-01T00:00:00Z');
    expect(evaluateInactivity(DEF, 'interesado', { '*': d('2026-05-30T00:00:00Z') }, now)).toBeNull();
    expect(evaluateInactivity(DEF, 'interesado', { '*': d('2026-01-01T00:00:00Z') }, now)?.to).toBe('dormido');
  });

  it('reglas con fieldEquals solo aplican si el campo coincide', () => {
    const def: LifecycleDefinitionData = {
      states: [{ key: 'a', label: 'A' }, { key: 'vip', label: 'VIP' }],
      transitions: [
        { from: '*', to: 'vip', when: { eventType: 'purchase', fieldEquals: { key: 'segmento', value: 'premium' } } },
      ],
    };
    expect(evaluateOnEvent(def, 'a', 'purchase', { segmento: 'premium' })?.to).toBe('vip');
    expect(evaluateOnEvent(def, 'a', 'purchase', { segmento: 'basico' })).toBeNull();
  });

  it('validateDefinition detecta estados desconocidos y reglas vacías', () => {
    const bad: LifecycleDefinitionData = {
      states: [{ key: 'a', label: 'A' }],
      transitions: [
        { from: 'zz', to: 'a', when: { eventType: 'x' } },
        { from: '*', to: 'nope', when: { eventType: 'x' } },
        { from: '*', to: 'a', when: {} },
      ],
    };
    const errors = validateDefinition(bad);
    expect(errors).toHaveLength(3);
  });
});
