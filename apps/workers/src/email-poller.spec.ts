import { describe, it, expect } from 'vitest';
import { pollVerdict, mailboxKey } from './email-poller.js';

/**
 * Regresión de un problema real de producción: este poller no tenía NINGÚN
 * filtro, así que poleteaba todas las EmailConnection cada 60 s — incluida
 * luis@virtuousleadership.com, que además está conectada en el módulo mail. Dos
 * pollers sobre el mismo buzón = el mismo correo entrando dos veces, una como
 * Conversation/Message y otra como EmailThread/EmailMessage.
 *
 * Y una lección que casi cuesta caro: el primer intento de arreglo también
 * saltaba las conexiones en ERROR. En este modelo heredado ese flag NUNCA se
 * reseteaba al acertar, así que significaba «alguna vez falló», no «está roto».
 * Los dos ERROR de producción eran fallos de red pasajeros sobre buzones que
 * seguían entregando correo: saltarlos habría apagado en silencio el único
 * buzón de un cliente. Por eso `pollVerdict` NO mira el estado.
 */
describe('pollVerdict', () => {
  const superseded = new Set([mailboxKey('t1', 'luis@virtuousleadership.com')]);

  it('salta el buzón que ya está en el módulo mail (evita la doble ingesta)', () => {
    expect(pollVerdict({ tenantId: 't1', email: 'luis@virtuousleadership.com' }, superseded)).toBe(
      'superseded',
    );
  });

  it('compara sin distinguir mayúsculas ni espacios', () => {
    expect(pollVerdict({ tenantId: 't1', email: '  LUIS@VirtuousLeadership.com ' }, superseded)).toBe(
      'superseded',
    );
  });

  it('no confunde el mismo correo en otro tenant', () => {
    expect(pollVerdict({ tenantId: 't2', email: 'luis@virtuousleadership.com' }, superseded)).toBe(
      'poll',
    );
  });

  it('sigue poleteando lo que no está migrado', () => {
    expect(pollVerdict({ tenantId: 't9', email: 'admisiones@colegio.es' }, superseded)).toBe('poll');
  });

  it('el estado NO influye: un ERROR heredado no apaga un buzón que funciona', () => {
    // El buzón de Raquel: status ERROR pegado por un timeout de red, único de su
    // tenant y sin equivalente en el módulo nuevo. Tiene que seguir poleteándose.
    expect(pollVerdict({ tenantId: 'raquel', email: 'admisiones@colegiochesterton.es' }, superseded)).toBe(
      'poll',
    );
  });

  it('sin buzones migrados no salta nada', () => {
    expect(pollVerdict({ tenantId: 't1', email: 'luis@virtuousleadership.com' }, new Set())).toBe('poll');
  });
});
