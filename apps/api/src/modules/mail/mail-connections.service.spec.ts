import { describe, it, expect, vi } from 'vitest';
import { MailConnectionsService } from './mail-connections.service.js';

function fakeConn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    driver: 'SMTP_IMAP',
    fromAddress: 'box@acme.com',
    displayName: null,
    signature: null,
    imapHost: 'imap',
    imapPort: 993,
    smtpHost: 'smtp',
    smtpPort: 465,
    username: 'box@acme.com',
    secure: true,
    secretEnc: 'enc',
    visibility: 'SHARED',
    ownerUserId: null,
    status: 'CONNECTED',
    lastError: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Minimal PrismaService stub: withTenant just runs the callback with a fake tx.
function makePrisma(conn: unknown, onFindMany?: (args: unknown) => void) {
  return {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) =>
      fn({
        mailConnection: {
          findUnique: async () => conn,
          findMany: async (args: unknown) => {
            onFindMany?.(args);
            return [];
          },
        },
      }),
  } as never;
}

const actor = { userId: 'u1', role: 'ADMIN' };

describe('MailConnectionsService — visibility/permissions', () => {
  it('blocks access to a PRIVATE connection owned by another user (404)', async () => {
    const svc = new MailConnectionsService(makePrisma(fakeConn({ visibility: 'PRIVATE', ownerUserId: 'u2' })));
    await expect(svc.get('t1', 'c1', actor)).rejects.toThrow();
  });

  it('allows the owner to access their PRIVATE connection', async () => {
    const svc = new MailConnectionsService(makePrisma(fakeConn({ visibility: 'PRIVATE', ownerUserId: 'u1' })));
    const got = await svc.get('t1', 'c1', actor);
    expect(got.id).toBe('c1');
  });

  it('allows anyone (with the perm) to access a SHARED connection', async () => {
    const svc = new MailConnectionsService(makePrisma(fakeConn({ visibility: 'SHARED', ownerUserId: null })));
    const got = await svc.get('t1', 'c1', { userId: 'someone-else', role: 'AGENT_USER' });
    expect(got.id).toBe('c1');
  });

  it('never leaks the encrypted secret in the safe DTO', async () => {
    const svc = new MailConnectionsService(makePrisma(fakeConn()));
    const got = await svc.get('t1', 'c1', actor);
    expect((got as Record<string, unknown>).secretEnc).toBeUndefined();
  });

  it('list() filters to SHARED + the actor\'s own PRIVATE', async () => {
    const spy = vi.fn();
    const svc = new MailConnectionsService(makePrisma(null, spy));
    await svc.list('t1', actor);
    const where = (spy.mock.calls[0]![0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toEqual([
      { visibility: 'SHARED' },
      { visibility: 'PRIVATE', ownerUserId: 'u1' },
    ]);
  });
});
