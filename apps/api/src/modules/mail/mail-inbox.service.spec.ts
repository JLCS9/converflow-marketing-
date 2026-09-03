import { describe, it, expect, vi } from 'vitest';
import {
  MailInboxService,
  encodeThreadCursor,
  decodeThreadCursor,
} from './mail-inbox.service.js';

describe('thread cursor', () => {
  it('round-trips a thread into a cursor and back', () => {
    const at = new Date('2026-08-27T10:15:00.000Z');
    const c = encodeThreadCursor({ lastMessageAt: at, id: 'th_123' });
    expect(decodeThreadCursor(c)).toEqual({ at, id: 'th_123' });
  });

  it('keeps an id intact even if it contains the separator', () => {
    const at = new Date('2026-08-27T10:15:00.000Z');
    const c = encodeThreadCursor({ lastMessageAt: at, id: 'a|b|c' });
    expect(decodeThreadCursor(c)).toEqual({ at, id: 'a|b|c' });
  });

  it('rejects garbage instead of throwing', () => {
    expect(decodeThreadCursor(undefined)).toBeNull();
    expect(decodeThreadCursor('')).toBeNull();
    expect(decodeThreadCursor('nonsense')).toBeNull();
    expect(decodeThreadCursor('not-a-date|th_1')).toBeNull();
    expect(decodeThreadCursor('2026-08-27T10:15:00.000Z|')).toBeNull();
  });
});

function makeService(rows: { id: string; lastMessageAt: Date | null }[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          emailThread: { findMany },
          emailThreadRead: { findMany: vi.fn().mockResolvedValue([]) },
          emailMessage: { findMany: vi.fn().mockResolvedValue([]) },
        }),
      ),
  } as never;
  const connections = { assertAccess: vi.fn().mockResolvedValue({}) } as never;
  const contacts = { findByEmail: vi.fn() } as never;
  return { svc: new MailInboxService(prisma, connections, contacts), findMany };
}

const actor = { userId: 'u1', role: 'OWNER' };
const rowsOf = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `th_${i}`,
    lastMessageAt: new Date(Date.UTC(2026, 7, 27, 10, 0, n - i)),
  }));

describe('MailInboxService.listThreads pagination', () => {
  it('returns no cursor when the folder fits in one page', async () => {
    const { svc } = makeService(rowsOf(3));
    const res = await svc.listThreads('t', 'c1', actor, 'INBOX', { limit: 10 });
    expect(res.items).toHaveLength(3);
    expect(res.nextCursor).toBeNull();
  });

  it('trims the sentinel row and hands back a cursor for the next page', async () => {
    // Asked for 2 → the service fetches 3 to detect "there is more".
    const { svc, findMany } = makeService(rowsOf(3));
    const res = await svc.listThreads('t', 'c1', actor, 'INBOX', { limit: 2 });
    expect(findMany.mock.calls[0]![0].take).toBe(3);
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toContain('th_1'); // last KEPT row, not the sentinel
  });

  it('caps an oversized limit instead of trusting the client', async () => {
    const { svc, findMany } = makeService([]);
    await svc.listThreads('t', 'c1', actor, 'INBOX', { limit: 100_000 });
    expect(findMany.mock.calls[0]![0].take).toBe(101); // 100 + sentinel
  });

  it('filters strictly older rows when given a cursor', async () => {
    const { svc, findMany } = makeService([]);
    const at = new Date('2026-08-27T10:15:00.000Z');
    await svc.listThreads('t', 'c1', actor, 'INBOX', {
      cursor: encodeThreadCursor({ lastMessageAt: at, id: 'th_9' }),
    });
    const where = findMany.mock.calls[0]![0].where;
    expect(where.AND).toEqual([
      { OR: [{ lastMessageAt: { lt: at } }, { lastMessageAt: at, id: { lt: 'th_9' } }] },
    ]);
  });

  it('keeps the cursor AND the search OR as separate clauses', async () => {
    // Regression: spreading the cursor into `where` let search's own `OR`
    // overwrite it, so page 2 returned page 1 forever.
    const { svc, findMany } = makeService([]);
    const at = new Date('2026-08-27T10:15:00.000Z');
    await svc.search('t', 'c1', actor, 'pedido', {
      cursor: encodeThreadCursor({ lastMessageAt: at, id: 'th_9' }),
    });
    const where = findMany.mock.calls[0]![0].where;
    expect(where.AND).toHaveLength(1); // cursor clause survived
    expect(where.OR).toBeDefined(); // search clause survived
  });

  it('short-circuits a search term that is too short', async () => {
    const { svc, findMany } = makeService([]);
    const res = await svc.search('t', 'c1', actor, 'a');
    expect(res).toEqual({ items: [], nextCursor: null });
    expect(findMany).not.toHaveBeenCalled();
  });
});
