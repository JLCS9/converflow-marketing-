import { describe, it, expect, vi } from 'vitest';
import { MailSyncService, isPermanent, backoffMs } from './mail-sync.service.js';

describe('isPermanent', () => {
  it('treats credential problems as permanent (no point retrying)', () => {
    expect(isPermanent('Invalid credentials (Failure)')).toBe(true);
    expect(isPermanent('535 5.7.8 Username and Password not accepted')).toBe(true);
    expect(isPermanent('AUTHENTICATIONFAILED')).toBe(true);
    expect(isPermanent('login failed')).toBe(true);
  });

  it('treats network problems as transient (retry them)', () => {
    expect(isPermanent('ETIMEDOUT')).toBe(false);
    expect(isPermanent('socket hang up')).toBe(false);
    expect(isPermanent('getaddrinfo EAI_AGAIN imap.example.com')).toBe(false);
    expect(isPermanent('Connection closed unexpectedly')).toBe(false);
  });
});

describe('backoffMs', () => {
  it('grows with the failure count and then caps', () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(6)).toBe(1_800_000);
    expect(backoffMs(99)).toBe(backoffMs(6)); // capped, never unbounded
  });
});

/** Build a service whose prisma/email are inert mocks, exposing the update args. */
function makeService(existing: { consecutiveFailures: number; errorNotifiedAt?: Date | null }) {
  const update = vi.fn().mockResolvedValue({});
  const tx = {
    mailConnection: {
      findUnique: vi.fn().mockResolvedValue({
        visibility: 'SHARED',
        ownerUserId: null,
        fromAddress: 'ventas@empresa.com',
        ...existing,
      }),
      update,
    },
    user: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null) },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const email = { notifyUser: vi.fn().mockResolvedValue({}) } as never;
  const svc = new MailSyncService(prisma, {} as never, email);
  return { svc, update };
}

describe('MailSyncService.recordFailure', () => {
  it('degrades (and keeps syncing) on the first transient failure', async () => {
    const { svc, update } = makeService({ consecutiveFailures: 0 });
    await svc['recordFailure']('t1', 'c1', new Error('ETIMEDOUT'));
    const data = update.mock.calls[0]![0].data;
    expect(data.status).toBe('DEGRADED');
    expect(data.consecutiveFailures).toBe(1);
    expect(data.nextRetryAt).toBeInstanceOf(Date); // eligible again later
  });

  it('escalates to ERROR immediately on an auth failure', async () => {
    const { svc, update } = makeService({ consecutiveFailures: 0 });
    await svc['recordFailure']('t1', 'c1', new Error('Invalid credentials'));
    const data = update.mock.calls[0]![0].data;
    expect(data.status).toBe('ERROR');
    expect(data.nextRetryAt).toBeNull();
  });

  it('escalates to ERROR once the retries run out', async () => {
    const { svc, update } = makeService({ consecutiveFailures: 7 });
    await svc['recordFailure']('t1', 'c1', new Error('socket hang up'));
    const data = update.mock.calls[0]![0].data;
    expect(data.status).toBe('ERROR');
    expect(data.consecutiveFailures).toBe(8);
  });
});
