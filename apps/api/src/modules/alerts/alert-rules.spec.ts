import { describe, it, expect } from 'vitest';
import { resolveAlertRules, DEFAULT_ALERT_RULES } from './alerts.service.js';

/**
 * El motor de alertas no tenía NINGUNA configuración: cuatro reglas fijas en
 * código que creaban y borraban alertas en la cuenta del tenant sin forma de
 * desactivarlas. Un cliente lo reportó como «se me crean alertas sin que yo
 * tenga control».
 *
 * `resolveAlertRules` tiene que ser tolerante: un tenant sin configurar, o con
 * un JSON parcial de una versión anterior, debe seguir funcionando igual que
 * antes en lugar de quedarse sin alertas.
 */
describe('resolveAlertRules', () => {
  it('sin configuración = comportamiento previo, todo activo', () => {
    expect(resolveAlertRules(null)).toEqual(DEFAULT_ALERT_RULES);
    expect(resolveAlertRules(undefined)).toEqual(DEFAULT_ALERT_RULES);
    expect(resolveAlertRules({})).toEqual(DEFAULT_ALERT_RULES);
  });

  it('respeta lo que el tenant desactiva', () => {
    const r = resolveAlertRules({ taskOverdue: { enabled: false } });
    expect(r.taskOverdue.enabled).toBe(false);
    // Y no arrastra a las demás.
    expect(r.oppOverdue.enabled).toBe(true);
  });

  it('un JSON parcial no deja al tenant sin alertas', () => {
    const r = resolveAlertRules({ staleLead: { enabled: true } });
    expect(r.staleLead.days).toBe(DEFAULT_ALERT_RULES.staleLead.days);
    expect(r.hotLead.enabled).toBe(true);
  });

  it('acota los umbrales en vez de aceptar cualquier número', () => {
    expect(resolveAlertRules({ staleLead: { enabled: true, days: 0 } }).staleLead.days).toBe(1);
    expect(resolveAlertRules({ staleLead: { enabled: true, days: 9999 } }).staleLead.days).toBe(365);
    expect(resolveAlertRules({ hotLead: { enabled: true, minScore: 500 } }).hotLead.minScore).toBe(100);
    expect(resolveAlertRules({ hotLead: { enabled: true, minScore: -3 } }).hotLead.minScore).toBe(1);
  });

  it('ignora basura sin reventar', () => {
    expect(() => resolveAlertRules('texto')).not.toThrow();
    expect(resolveAlertRules({ staleLead: { enabled: 'sí', days: 'muchos' } })).toEqual(
      DEFAULT_ALERT_RULES,
    );
    expect(resolveAlertRules({ hotLead: { minScore: NaN } }).hotLead.minScore).toBe(
      DEFAULT_ALERT_RULES.hotLead.minScore,
    );
  });

  it('redondea decimales: los umbrales son enteros', () => {
    expect(resolveAlertRules({ staleLead: { enabled: true, days: 7.6 } }).staleLead.days).toBe(8);
  });
});
