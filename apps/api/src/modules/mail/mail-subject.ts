/**
 * Utilidades de asunto compartidas por ingest y compose. Fichero propio a
 * propósito: cuando vivían en mail-ingest, compose→ingest→auto-reply→compose
 * formaba un ciclo de imports que dejaba metadata de DI a undefined.
 */

/** Reply/forward prefixes we recognise. Keep both helpers below in sync. */
const REPLY_PREFIX_RE = /^((re|rv|fwd|fw)\s*:\s*)+/i;

export function normalizeSubject(subject?: string): string {
  return (subject ?? '').replace(REPLY_PREFIX_RE, '').trim();
}

/**
 * Does the raw subject carry a Re:/RV:/Fwd: prefix?
 *
 * Only such a message may be threaded by subject. A bare subject is a NEW
 * conversation, even if it repeats one we have seen — see the guard in
 * `resolveThreadBySubject`.
 */
export function looksLikeReply(subject?: string): boolean {
  return REPLY_PREFIX_RE.test(subject ?? '');
}
