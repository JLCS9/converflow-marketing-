import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for the Baileys auth state stored in bot_sessions.authStateEncrypted (Bytes).
 * Uses the 32-byte key from ENCRYPTION_KEY (64 hex chars) — same key family as the API.
 * Layout: iv[12] || authTag[16] || ciphertext.
 */
const keyHex = process.env.ENCRYPTION_KEY ?? '';
if (!/^[0-9a-f]{64}$/.test(keyHex)) {
  throw new Error('ENCRYPTION_KEY must be 64 hex chars for the bot-runner auth-state encryption');
}
const KEY = Buffer.from(keyHex, 'hex');
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptBuffer(buf: Buffer): Buffer {
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
