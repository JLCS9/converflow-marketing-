import {
  proto,
  initAuthCreds,
  BufferJSON,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from 'baileys';
import { prisma, withRlsBypass } from '@converflow/db';
import { encryptBuffer, decryptBuffer } from './crypto';

type KeyStore = { [type: string]: { [id: string]: unknown } };

/**
 * Baileys auth state backed by the (encrypted) bot_sessions row. The whole
 * { creds, keys } object is serialized with Baileys' BufferJSON, encrypted
 * with AES-256-GCM, and stored as a single Bytes blob. Re-written on every
 * creds/keys mutation — fine for the modest number of bots per tenant.
 *
 * bot-runner is a trusted system process, so it uses withRlsBypass.
 */
export async function useDbAuthState(
  botId: string,
  tenantId: string,
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
}> {
  const row = await withRlsBypass(prisma, (tx) =>
    tx.botSession.findUnique({ where: { botId } }),
  );

  let creds: AuthenticationCreds;
  let keys: KeyStore = {};

  if (row?.authStateEncrypted) {
    try {
      const json = decryptBuffer(Buffer.from(row.authStateEncrypted)).toString('utf8');
      const parsed = JSON.parse(json, BufferJSON.reviver) as {
        creds: AuthenticationCreds;
        keys?: KeyStore;
      };
      creds = parsed.creds;
      keys = parsed.keys ?? {};
    } catch {
      creds = initAuthCreds();
      keys = {};
    }
  } else {
    creds = initAuthCreds();
  }

  const persist = async (): Promise<void> => {
    const json = JSON.stringify({ creds, keys }, BufferJSON.replacer);
    // Prisma Bytes expects Uint8Array<ArrayBuffer>; copy out of the Node Buffer.
    const enc = Uint8Array.from(encryptBuffer(Buffer.from(json, 'utf8')));
    await withRlsBypass(prisma, (tx) =>
      tx.botSession.upsert({
        where: { botId },
        create: { botId, tenantId, authStateEncrypted: enc },
        update: { authStateEncrypted: enc },
      }),
    );
  };

  const state: AuthenticationState = {
    creds,
    keys: {
      get: (type, ids) => {
        const store = keys[type] ?? {};
        const out: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        for (const id of ids) {
          let value = store[id];
          if (value !== undefined) {
            if (type === 'app-state-sync-key') {
              value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
            }
            out[id] = value as SignalDataTypeMap[typeof type];
          }
        }
        return out;
      },
      set: (data) => {
        for (const type of Object.keys(data)) {
          const category = data[type as keyof typeof data] ?? {};
          keys[type] = keys[type] ?? {};
          for (const id of Object.keys(category)) {
            const value = (category as Record<string, unknown>)[id];
            if (value === null || value === undefined) delete keys[type]![id];
            else keys[type]![id] = value;
          }
        }
        return persist();
      },
    },
  };

  const clear = async (): Promise<void> => {
    await withRlsBypass(prisma, (tx) => tx.botSession.deleteMany({ where: { botId } }));
  };

  return { state, saveCreds: persist, clear };
}
