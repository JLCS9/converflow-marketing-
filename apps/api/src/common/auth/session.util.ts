import { randomBytes, createHash } from 'node:crypto';

/**
 * Session token format:
 *   - The raw token (returned to the client in a cookie) is 32 random bytes
 *     base64url-encoded → 43 chars.
 *   - The DB stores the SHA-256 of the token, so a DB leak can't be replayed.
 */

export function generateSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiry(ttlMinutes: number): Date {
  return new Date(Date.now() + ttlMinutes * 60 * 1000);
}
