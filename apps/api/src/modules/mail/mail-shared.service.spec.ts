import { describe, it, expect, vi } from 'vitest';
import { MailSharedService } from './mail-shared.service.js';

function makeService(tx: Record<string, unknown>) {
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx),
  } as never;
  const connections = { assertAccess: vi.fn().mockResolvedValue({}) } as never;
  return new MailSharedService(prisma, connections);
}

const actor = { userId: 'u1', role: 'AGENT_USER' };

describe('MailSharedService.setStatus', () => {
  it('rejects an invalid status', async () => {
    const svc = makeService({});
    await expect(svc.setStatus('t', 'th1', actor, 'NOPE')).rejects.toThrow();
  });
});

describe('MailSharedService.claim (anti-collision)', () => {
  it('claims a free thread for me', async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      emailThread: {
        findUnique: vi.fn().mockResolvedValue({ connectionId: 'c1', lockedByUserId: null, lockedAt: null }),
        update,
      },
      user: { findUnique: vi.fn() },
    };
    const svc = makeService(tx);
    const res = await svc.claim('t', 'th1', actor);
    expect(res).toMatchObject({ locked: true, byMe: true });
    expect(update).toHaveBeenCalled();
  });

  it('reports the holder when locked by someone else recently', async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      emailThread: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ connectionId: 'c1', lockedByUserId: 'u2', lockedAt: new Date() }),
        update,
      },
      user: { findUnique: vi.fn().mockResolvedValue({ name: 'Ana' }) },
    };
    const svc = makeService(tx);
    const res = await svc.claim('t', 'th1', actor);
    expect(res).toMatchObject({ locked: true, byMe: false, byName: 'Ana' });
    expect(update).not.toHaveBeenCalled();
  });

  it('takes over a stale lock', async () => {
    const update = vi.fn().mockResolvedValue({});
    const old = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago → stale
    const tx = {
      emailThread: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ connectionId: 'c1', lockedByUserId: 'u2', lockedAt: old }),
        update,
      },
      user: { findUnique: vi.fn() },
    };
    const svc = makeService(tx);
    const res = await svc.claim('t', 'th1', actor);
    expect(res).toMatchObject({ locked: true, byMe: true });
    expect(update).toHaveBeenCalled();
  });
});
