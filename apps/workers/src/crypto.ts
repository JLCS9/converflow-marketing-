import { createDecipheriv } from 'node:crypto';

// Mirrors apps/api common/utils/crypto.ts (aes-256-gcm, base64 iv|tag|ct).
const KEY = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'hex');
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
