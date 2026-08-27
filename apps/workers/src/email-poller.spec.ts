import { describe, it, expect } from 'vitest';
import { pollVerdict, mailboxKey } from './email-poller.js';

/**
 * Regresión de un problema real de producción: este poller no tenía NINGÚN
 * filtro, así que poleteaba todas las EmailConnection cada 60 s.
 *
 * Consecuencias observadas el 2026-08-27:
 *  - luis@virtuousleadership.com estaba conectado también en el módulo mail →
 *    el mismo correo podía entrar dos veces, como Conversation y como
 *    EmailThread.
 *  - Dos buzones en ERROR se reintentaban indefinidamente sin backoff, o sea un
 *    bucle de login fallido contra el proveedor, que responde bloqueando la
 *    cuenta.
 */
describe('pollVerdict', () => {
  const superseded = new Set([mailboxKey('t1', 'luis@virtuousleadership.com')]);

  it('salta el buzón que ya está en el módulo mail (evita la doble ingesta)', () => {
    expect(
      pollVerdict({ tenantId: 't1', email: 'luis@virtuousleadership.com', status: 'CONNECTED' }, superseded),
    ).toBe('superseded');
  });

  it('compara sin distinguir mayúsculas ni espacios', () => {
    expect(
      pollVerdict({ tenantId: 't1', email: '  LUIS@VirtuousLeadership.com ', status: 'CONNECTED' }, superseded),
    ).toBe('superseded');
  });

  it('no confunde el mismo correo en otro tenant', () => {
    expect(
      pollVerdict({ tenantId: 't2', email: 'luis@virtuousleadership.com', status: 'CONNECTED' }, superseded),
    ).toBe('poll');
  });

  it('salta una conexión en ERROR en vez de martillear al proveedor', () => {
    expect(
      pollVerdict({ tenantId: 't9', email: 'admisiones@colegio.es', status: 'ERROR' }, superseded),
    ).toBe('errored');
  });

  it('«superseded» gana a «errored»: si ya está migrado, ni se menciona', () => {
    expect(
      pollVerdict({ tenantId: 't1', email: 'luis@virtuousleadership.com', status: 'ERROR' }, superseded),
    ).toBe('superseded');
  });

  it('sigue poleteando lo que está sano y sin migrar', () => {
    expect(
      pollVerdict({ tenantId: 't9', email: 'otro@empresa.es', status: 'CONNECTED' }, superseded),
    ).toBe('poll');
  });
});
