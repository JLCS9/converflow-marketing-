import { randomBytes } from 'node:crypto';

/**
 * Generate a temp password using only chars that are unambiguous in any font
 * and trouble-free for clipboard managers (no `_`, `-`, `+`, `/`, `=`, `O`,
 * `0`, `I`, `l`, `1`, `o`).
 *
 * 14 chars from a 53-char alphabet → ~80 bits of entropy. Plenty for a
 * one-time password that the recipient is supposed to change immediately.
 */
const READABLE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateReadablePassword(length = 14): string {
  // Oversample bytes so we can reject biased values (rejection sampling).
  // 256 % 53 = 44, so reject anything >= 256 - 44 = 212.
  const max = 256 - (256 % READABLE_ALPHABET.length);
  let result = '';
  while (result.length < length) {
    const bytes = randomBytes(length * 2);
    for (const b of bytes) {
      if (result.length >= length) break;
      if (b >= max) continue;
      result += READABLE_ALPHABET[b % READABLE_ALPHABET.length];
    }
  }
  return result;
}
