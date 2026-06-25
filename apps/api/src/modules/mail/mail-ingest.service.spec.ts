import { describe, it, expect, vi } from 'vitest';
import { MailIngestService, normalizeSubject } from './mail-ingest.service.js';
import type { ParsedEmail } from './drivers/index.js';

function baseEmail(over: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    rfcMessageId: '<m-1@acme.com>',
    to: ['box@acme.com'],
    cc: [],
    subject: 'Hola',
    fromAddress: 'cliente@x.com',
    hasAttachments: false,
    ...over,
  };
}

/** Build a prisma mock whose withTenant runs the callback with a fake tx. */
function makeService(tx: Record<string, unknown>) {
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx),
  } as never;
  const attachments = { storeInbound: vi.fn().mockResolvedValue(undefined) } as never;
  return new MailIngestService(prisma, attachments);
}

describe('normalizeSubject', () => {
  it('strips Re:/Fwd:/RV: prefixes', () => {
    expect(normalizeSubject('Re: Hola')).toBe('Hola');
    expect(normalizeSubject('RV: Fwd: Re: Pedido')).toBe('Pedido');
    expect(normalizeSubject('Pedido')).toBe('Pedido');
  });
});

describe('MailIngestService.ingest — threading', () => {
  it('dedupes by rfcMessageId (no new message/thread)', async () => {
    const threadCreate = vi.fn();
    const messageCreate = vi.fn();
    const tx = {
      emailMessage: {
        findFirst: vi.fn().mockResolvedValue({ id: 'm1', threadId: 't1' }), // dedupe hit
        create: messageCreate,
      },
      emailThread: { findFirst: vi.fn(), create: threadCreate, update: vi.fn() },
    };
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail());
    expect(res).toEqual({ created: false, threadId: 't1', messageId: 'm1' });
    expect(threadCreate).not.toHaveBeenCalled();
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('links a reply to the existing thread via References (no new thread)', async () => {
    const threadCreate = vi.fn();
    const tx = {
      emailMessage: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // dedupe miss
          .mockResolvedValueOnce({ threadId: 't-parent' }), // references hit
        create: vi.fn().mockResolvedValue({ id: 'm-new' }),
      },
      emailThread: { findFirst: vi.fn(), create: threadCreate, update: vi.fn() },
    };
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail({ references: '<m-1@acme.com>' }));
    expect(res.created).toBe(true);
    expect(res.threadId).toBe('t-parent');
    expect(threadCreate).not.toHaveBeenCalled();
  });

  it('opens a new thread when nothing matches', async () => {
    const threadCreate = vi.fn().mockResolvedValue({ id: 't-new' });
    const update = vi.fn();
    const tx = {
      emailMessage: {
        findFirst: vi.fn().mockResolvedValue(null), // dedupe miss (no refs → no 2nd call)
        create: vi.fn().mockResolvedValue({ id: 'm-new' }),
      },
      emailThread: { findFirst: vi.fn().mockResolvedValue(null), create: threadCreate, update },
    };
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail());
    expect(res.created).toBe(true);
    expect(res.threadId).toBe('t-new');
    expect(threadCreate).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });
});
