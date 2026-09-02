/**
 * Construcción de destinatarios para «Responder a todos».
 *
 * Una sola función pura, compartida por el cliente (rellenar el compositor) y
 * por el servidor (defaults de reply). Antes cada lado tenía su propia lógica y
 * el cliente construía el CC desde `thread.participants` — que en hilos creados
 * por un correo ENTRANTE solo contiene al remitente, así que los CC se perdían
 * (el bug reportado como «Responder a todos elimina los CC»).
 *
 * Regla: responder-a-todos = remitente original (o su Reply-To) + todos los
 * to/cc del mensaje original, menos las direcciones del propio buzón y sin
 * duplicados. La comparación es case-insensitive porque las direcciones de
 * correo lo son en la práctica.
 */

/** Lo que hace falta del mensaje original. Todos los campos toleran null. */
export interface ReplyAllSource {
  fromAddress?: string | null;
  /** Reply-To del original: si existe, manda sobre From (RFC 5322 §3.6.2). */
  replyTo?: string | null;
  toAddresses?: readonly string[] | null;
  ccAddresses?: readonly string[] | null;
}

export interface ReplyAllRecipients {
  to: string;
  cc: string[];
}

const norm = (a: string | null | undefined): string => (a ?? '').trim().toLowerCase();

/**
 * @param source  El último mensaje entrante del hilo.
 * @param ownAddresses  Direcciones que son «nosotros»: la del buzón y cualquier
 *   alias. Se excluyen del CC (no te pones en copia a ti mismo) y nunca se
 *   eligen como To.
 */
export function buildReplyAllRecipients(
  source: ReplyAllSource,
  ownAddresses: readonly string[],
): ReplyAllRecipients {
  const own = new Set(ownAddresses.map(norm).filter(Boolean));

  // To: el Reply-To si el remitente pidió uno, si no el From. Si por datos
  // corruptos el "remitente" fuéramos nosotros, se cae al primer tercero.
  const senderRaw = (source.replyTo ?? '').trim() || (source.fromAddress ?? '').trim();

  const candidates: string[] = [];
  const push = (raw: string | null | undefined) => {
    const r = (raw ?? '').trim();
    if (r) candidates.push(r);
  };
  push(senderRaw);
  for (const a of source.toAddresses ?? []) push(a);
  for (const a of source.ccAddresses ?? []) push(a);

  // Dedupe conservando el ORDEN y la grafía original (se muestra al usuario);
  // la clave de comparación es normalizada.
  const seen = new Set<string>();
  const external: string[] = [];
  for (const c of candidates) {
    const k = norm(c);
    if (!k || own.has(k) || seen.has(k)) continue;
    seen.add(k);
    external.push(c);
  }

  // El To es el remitente si sobrevivió al filtro; si el remitente era una de
  // nuestras direcciones (p. ej. respondiendo sobre un hilo donde el último
  // entrante es un rebote nuestro), el primer externo hace de To.
  const senderKey = norm(senderRaw);
  const to =
    senderKey && !own.has(senderKey)
      ? external.find((e) => norm(e) === senderKey) ?? external[0] ?? ''
      : external[0] ?? '';

  const cc = external.filter((e) => norm(e) !== norm(to));
  return { to, cc };
}

/**
 * Remitentes que nunca son clientes reales: daemons, bounces, no-reply…
 * ÚNICA fuente (antes triplicado en poller/ingest). E2.
 */
export const AUTOMATED_SENDER_RE =
  /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce|bounces|notifications?|mailer|abuse)[@+]/i;

export function isAutomatedSender(address: string): boolean {
  return AUTOMATED_SENDER_RE.test(address.trim());
}
