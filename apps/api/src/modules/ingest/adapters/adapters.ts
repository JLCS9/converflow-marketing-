import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EventBatchInput, EventInput } from '@converflow/shared';

/**
 * Adaptadores de ingesta (F1). Cada uno hace UNA cosa: traducir el payload
 * de su fuente al esquema común de evento — misma filosofía que el proveedor
 * de LLM: los sistemas del cliente son intercambiables detrás del adaptador,
 * nunca dependencias estructurales.
 *
 * Los traductores son funciones puras: payload → EventBatchInput. Toleran
 * campos ausentes (devuelven los eventos que puedan derivar) y JAMÁS lanzan
 * por datos raros de la fuente: un webhook basura se responde 202 con 0
 * eventos, no con un 500 que provoca reintentos infinitos del emisor.
 */

const s = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const when = (v: unknown): Date | undefined => {
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v); // epoch s|ms
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Brevo — webhooks de email (transaccional y marketing).
// Docs: eventos 'delivered', 'opened'/'unique_opened', 'click', 'hard_bounce',
// 'soft_bounce', 'spam', 'unsubscribed', 'blocked'. Llegan como objeto suelto
// o como array.
// ---------------------------------------------------------------------------
const BREVO_EVENT_TYPE: Record<string, string> = {
  delivered: 'email_delivered',
  opened: 'email_open',
  unique_opened: 'email_open',
  click: 'email_click',
  hard_bounce: 'email_bounce',
  soft_bounce: 'email_bounce',
  blocked: 'email_bounce',
  spam: 'email_spam',
  unsubscribed: 'email_unsubscribe',
};

export function translateBrevo(payload: unknown): EventBatchInput {
  const items = Array.isArray(payload) ? payload : [payload];
  const events: EventInput[] = [];
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue;
    const p = raw as Record<string, unknown>;
    const brevoEvent = s(p.event)?.toLowerCase();
    const email = s(p.email)?.toLowerCase();
    const type = brevoEvent ? BREVO_EVENT_TYPE[brevoEvent] : undefined;
    if (!type || !email) continue;
    events.push({
      type,
      occurredAt: when(p.ts_event) ?? when(p.date) ?? undefined,
      // message-id + evento: la reentrega del webhook no duplica.
      externalId: s(p['message-id']) ? `${s(p['message-id'])}:${brevoEvent}:${email}` : undefined,
      identity: { email },
      props: {
        subject: s(p.subject),
        link: s(p.link),
        tag: s(p.tag) ?? (Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string') : undefined),
        brevoEvent,
      },
    });
  }
  return { source: 'brevo', events };
}

// ---------------------------------------------------------------------------
// LearnDash (WordPress) — vía plugin de webhooks (WP Webhooks / AutomatorWP).
// Contrato flexible: buscamos email + curso + acción en los nombres de campo
// habituales de esos plugins.
// ---------------------------------------------------------------------------
const LEARNDASH_EVENT_TYPE: Record<string, string> = {
  enrolled: 'enrollment',
  enroll: 'enrollment',
  course_enrolled: 'enrollment',
  completed: 'course_completed',
  course_completed: 'course_completed',
  lesson_completed: 'course_activity',
  topic_completed: 'course_activity',
  quiz_completed: 'course_activity',
};

export function translateLearndash(payload: unknown): EventBatchInput {
  const items = Array.isArray(payload) ? payload : [payload];
  const events: EventInput[] = [];
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue;
    const p = raw as Record<string, unknown>;
    const email = (s(p.user_email) ?? s(p.email))?.toLowerCase();
    const action = (s(p.action) ?? s(p.event) ?? s(p.trigger))?.toLowerCase();
    const type = action ? LEARNDASH_EVENT_TYPE[action] : undefined;
    if (!type || !email) continue;
    const courseId = s(p.course_id) ?? s(String(p.course_id ?? '') || undefined);
    events.push({
      type,
      occurredAt: when(p.date) ?? when(p.timestamp) ?? undefined,
      externalId: courseId ? `${action}:${courseId}:${email}` : undefined,
      identity: { email },
      props: {
        courseId,
        courseTitle: s(p.course_title) ?? s(p.course_name),
        userName: s(p.user_name) ?? s(p.display_name),
        action,
      },
    });
  }
  return { source: 'learndash', events };
}

// ---------------------------------------------------------------------------
// Genérico: el payload YA es nuestro esquema (source lo impone la fuente).
// ---------------------------------------------------------------------------
export function translateGeneric(payload: unknown, sourceName: string): EventBatchInput {
  const p = (payload ?? {}) as Record<string, unknown>;
  const events = Array.isArray(p.events) ? p.events : Array.isArray(payload) ? payload : [];
  return { source: sourceName, events: events as EventInput[] };
}

export const TRANSLATORS: Record<string, (payload: unknown) => EventBatchInput> = {
  brevo: translateBrevo,
  learndash: translateLearndash,
};

// ---------------------------------------------------------------------------
// Firma HMAC sobre el raw body (WooCommerce y fuentes que la soporten).
// ---------------------------------------------------------------------------
export function verifyHmacSignature(
  rawBody: Buffer,
  secret: string,
  signatureBase64: string | undefined,
): boolean {
  if (!signatureBase64) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signatureBase64, 'base64');
  } catch {
    return false;
  }
  return expected.length === given.length && timingSafeEqual(expected, given);
}
