import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  API_KEY_BODY_LENGTH,
  API_KEY_PREFIX,
  API_KEY_VISIBLE_PREFIX_LENGTH,
} from '@converflow/shared';

/**
 * Generate a fresh API key + its visible prefix + the SHA-256 hash that
 * goes to the DB. Caller persists `prefix` and `hash`, returns `secret`
 * to the human exactly once.
 *
 * Format: `cfai_<32 url-safe base62 chars>`.
 *  - `cfai_` is the static brand prefix (so leaks are spottable).
 *  - The body is generated from crypto.randomBytes and then mapped onto a
 *    62-char alphabet to keep the secret URL-safe and easy to paste.
 */
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomBase62(length: number): string {
  // Generate slightly extra bytes so we have enough entropy after rejection.
  const buf = randomBytes(length * 2);
  let out = '';
  for (let i = 0; i < buf.length && out.length < length; i += 1) {
    const byte = buf[i] ?? 0;
    const idx = byte % ALPHABET.length;
    out += ALPHABET[idx] ?? '';
  }
  return out;
}

export interface GeneratedApiKey {
  /** Plaintext secret returned to the user once. */
  secret: string;
  /** Visible prefix stored in the DB (constant length). */
  prefix: string;
  /** SHA-256 hex digest of `secret` — what we actually compare against. */
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const body = randomBase62(API_KEY_BODY_LENGTH);
  const secret = `${API_KEY_PREFIX}${body}`;
  const prefix = secret.slice(0, API_KEY_VISIBLE_PREFIX_LENGTH);
  const hash = hashApiKey(secret);
  return { secret, prefix, hash };
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Constant-time string comparison so a timing oracle can't be used to
 * leak the stored hash. Returns false if lengths differ.
 */
export function safeHashEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Inspect a raw Authorization header value and return the bearer token
 * if it looks like one of ours. Returns null when there is no token, the
 * scheme is wrong, or the shape doesn't match the expected `cfai_*`.
 */
export function extractBearerApiKey(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('bearer ')) return null;
  const token = trimmed.slice('bearer '.length).trim();
  if (!token.startsWith(API_KEY_PREFIX)) return null;
  if (token.length !== API_KEY_PREFIX.length + API_KEY_BODY_LENGTH) return null;
  return token;
}
