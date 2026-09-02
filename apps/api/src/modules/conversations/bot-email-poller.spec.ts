import { describe, it, expect } from 'vitest';
import { mailboxKey, pollVerdict } from './bot-email-poller.service.js';
import { isAutomatedSender } from '@converflow/shared';

/**
 * E2 · Decisiones puras del poller portado: el skip de buzones migrados al
 * módulo Mail y el guard de remitentes automatizados (única fuente, shared).
 */
describe('pollVerdict', () => {
  const superseded = new Set([mailboxKey('t1', 'Ventas@Acme.com')]);

  it('buzón ya migrado al módulo Mail → superseded (insensible a mayúsculas)', () => {
    expect(pollVerdict({ tenantId: 't1', email: 'ventas@acme.com' }, superseded)).toBe('superseded');
    expect(pollVerdict({ tenantId: 't1', email: '  VENTAS@ACME.COM ' }, superseded)).toBe('superseded');
  });

  it('mismo email en OTRO tenant → se sigue sondeando', () => {
    expect(pollVerdict({ tenantId: 't2', email: 'ventas@acme.com' }, superseded)).toBe('poll');
  });
});

describe('isAutomatedSender (shared, antes triplicado)', () => {
  it.each(['mailer-daemon@x.com', 'no-reply@x.com', 'noreply@x.com', 'bounces@x.com', 'postmaster@x.com'])(
    'bloquea %s',
    (addr) => expect(isAutomatedSender(addr)).toBe(true),
  );
  it('deja pasar remitentes reales', () => {
    expect(isAutomatedSender('carlos.demo@empresa-x.com')).toBe(false);
  });
});
