import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { eventBatchSchema } from '@converflow/shared';
import { translateBrevo, translateLearndash, translateWoocommerce, verifyHmacSignature } from './adapters.js';
import { VERTICAL_TEMPLATES } from '../../verticals/templates.js';
import { validateDefinition } from '../../lifecycle/lifecycle.engine.js';

describe('adaptador Brevo', () => {
  it('traduce un evento de apertura al esquema común', () => {
    const batch = translateBrevo({
      event: 'unique_opened',
      email: 'Ana@Empresa.com',
      'message-id': '<m1@brevo>',
      subject: 'Novedades',
      ts_event: 1756800000,
    });
    expect(batch.source).toBe('brevo');
    expect(batch.events[0]).toMatchObject({
      type: 'email_open',
      identity: { email: 'ana@empresa.com' },
      externalId: '<m1@brevo>:unique_opened:ana@empresa.com',
    });
    // y el resultado pasa la validación del esquema común
    expect(() => eventBatchSchema.parse(batch)).not.toThrow();
  });

  it('acepta arrays y descarta entradas sin email o evento desconocido', () => {
    const batch = translateBrevo([
      { event: 'click', email: 'a@b.com', link: 'https://x' },
      { event: 'raro', email: 'a@b.com' },
      { event: 'click' },
      'basura',
    ]);
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]!.props).toMatchObject({ link: 'https://x' });
  });

  it('unsubscribed se traduce a email_unsubscribe', () => {
    const batch = translateBrevo({ event: 'unsubscribed', email: 'baja@x.com' });
    expect(batch.events[0]!.type).toBe('email_unsubscribe');
  });

  it('payload basura → 0 eventos, jamás lanza', () => {
    expect(translateBrevo(null).events).toHaveLength(0);
    expect(translateBrevo('x').events).toHaveLength(0);
    expect(translateBrevo({ nested: { deep: true } }).events).toHaveLength(0);
  });
});

describe('adaptador LearnDash', () => {
  it('traduce una inscripción con dedupe por curso+email', () => {
    const batch = translateLearndash({
      action: 'course_enrolled',
      user_email: 'Alumno@Uni.es',
      course_id: 42,
      course_title: 'Liderazgo I',
    });
    expect(batch.events[0]).toMatchObject({
      type: 'enrollment',
      identity: { email: 'alumno@uni.es' },
      props: { courseTitle: 'Liderazgo I' },
    });
    expect(() => eventBatchSchema.parse(batch)).not.toThrow();
  });

  it('lecciones y quizzes caen a course_activity', () => {
    expect(translateLearndash({ action: 'lesson_completed', email: 'a@b.com' }).events[0]!.type)
      .toBe('course_activity');
    expect(translateLearndash({ trigger: 'quiz_completed', email: 'a@b.com' }).events[0]!.type)
      .toBe('course_activity');
  });
});

describe('adaptador WooCommerce (validación defensiva de un plugin propio)', () => {
  it('acepta un pedido de compra en forma canónica (el plugin ya la manda así)', () => {
    const batch = translateWoocommerce({
      events: [
        {
          type: 'purchase',
          occurredAt: '2026-09-03T10:15:00Z',
          externalId: 'order:4831',
          identity: { email: 'Ana@Empresa.com' },
          props: { orderId: '4831', amount: '149.00', currency: 'EUR', company: 'Acme S.L.' },
        },
      ],
    });
    expect(batch.source).toBe('woocommerce');
    expect(batch.events[0]).toMatchObject({
      type: 'purchase',
      externalId: 'order:4831',
      identity: { email: 'ana@empresa.com' },
      props: { orderId: '4831', amount: '149.00' },
    });
    expect(() => eventBatchSchema.parse(batch)).not.toThrow();
  });

  it('un evento con type malformado se descarta SIN tumbar los demás del mismo lote', () => {
    const batch = translateWoocommerce({
      events: [
        { type: 'PURCHASE-mayúsculas!', identity: { email: 'a@b.com' } }, // no cuadra con el regex
        { type: 'purchase', identity: { email: 'a@b.com' } },
      ],
    });
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]!.type).toBe('purchase');
  });

  it('reembolso sin email (identity opcional) se acepta igual', () => {
    const batch = translateWoocommerce({
      events: [{ type: 'refund', externalId: 'refund:4831', props: { orderId: '4831', amount: '149.00' } }],
    });
    expect(batch.events[0]).toMatchObject({ type: 'refund', identity: undefined });
  });

  it('payload basura → 0 eventos, jamás lanza', () => {
    expect(translateWoocommerce(null).events).toHaveLength(0);
    expect(translateWoocommerce('x').events).toHaveLength(0);
    expect(translateWoocommerce({ events: 'no-es-un-array' }).events).toHaveLength(0);
    expect(translateWoocommerce({ events: ['basura', null, 42] }).events).toHaveLength(0);
  });
});

describe('firma HMAC sobre raw body', () => {
  const secret = 'shhh-secret';
  const raw = Buffer.from('{"a":1}');
  const good = createHmac('sha256', secret).update(raw).digest('base64');

  it('acepta la firma correcta y rechaza las demás', () => {
    expect(verifyHmacSignature(raw, secret, good)).toBe(true);
    expect(verifyHmacSignature(raw, secret, undefined)).toBe(false);
    expect(verifyHmacSignature(raw, secret, 'AAAA')).toBe(false);
    expect(verifyHmacSignature(Buffer.from('{"a":2}'), secret, good)).toBe(false);
  });
});

describe('plantillas de vertical', () => {
  it('todas las plantillas tienen ciclos de vida válidos y claves de campo bien formadas', () => {
    for (const tpl of Object.values(VERTICAL_TEMPLATES)) {
      expect(validateDefinition(tpl.lifecycle.definition)).toEqual([]);
      for (const f of tpl.profileFields) {
        expect(f.key).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
        if (f.type === 'SELECT' || f.type === 'MULTISELECT') {
          expect(f.options?.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('residencias marca los datos clínicos como sensibles con retención', () => {
    const r = VERTICAL_TEMPLATES.residencias!;
    const clinical = r.profileFields.filter((f) => f.sensitive);
    expect(clinical.length).toBeGreaterThanOrEqual(2);
    for (const f of clinical) expect(f.retentionDays).toBeGreaterThan(0);
  });
});
