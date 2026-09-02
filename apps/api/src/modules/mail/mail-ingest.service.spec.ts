import { describe, it, expect, vi } from 'vitest';
import { MailIngestService, normalizeSubject, looksLikeReply } from './mail-ingest.service.js';
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
  const contacts = { ensureLead: vi.fn().mockResolvedValue(null) } as never;
  const routing = { match: vi.fn().mockResolvedValue(null) };
  const shared = { assignSystem: vi.fn().mockResolvedValue({}) };
  const autoReply = { maybeRespond: vi.fn().mockResolvedValue(undefined) };
  const svc = new MailIngestService(
    prisma, attachments, contacts, routing as never, shared as never, autoReply as never,
  );
  // los hooks quedan accesibles para los asserts de los tests
  (svc as never as { __mocks: unknown }).__mocks = { routing, shared, autoReply };
  return svc;
}

describe('normalizeSubject', () => {
  it('strips Re:/Fwd:/RV: prefixes', () => {
    expect(normalizeSubject('Re: Hola')).toBe('Hola');
    expect(normalizeSubject('RV: Fwd: Re: Pedido')).toBe('Pedido');
    expect(normalizeSubject('Pedido')).toBe('Pedido');
  });
});

describe('looksLikeReply', () => {
  it('detects the prefixes normalizeSubject strips', () => {
    expect(looksLikeReply('Re: Hola')).toBe(true);
    expect(looksLikeReply('RV: Fwd: Pedido')).toBe(true);
    expect(looksLikeReply('re:hola')).toBe(true);
  });

  it('treats a bare subject as a new conversation', () => {
    expect(looksLikeReply('Presupuesto')).toBe(false);
    expect(looksLikeReply('')).toBe(false);
    expect(looksLikeReply(undefined)).toBe(false);
    // Not a prefix — the word merely starts with "re".
    expect(looksLikeReply('Renovación del contrato')).toBe(false);
  });
});

/**
 * Regression for the bug a client hit in production: unrelated emails sharing a
 * subject were merged into one thread. Since reply() defaults the recipient to
 * the last inbound sender, that could send one customer's content to another.
 */
describe('MailIngestService.ingest — subject fallback', () => {
  /** tx where the dedupe misses, no refs match, and the subject query returns `candidates`. */
  function subjectTx(candidates: { id: string; participants: unknown }[], messages: unknown[] = []) {
    const threadCreate = vi.fn().mockResolvedValue({ id: 't-new' });
    return {
      tx: {
        emailMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue(messages),
          create: vi.fn().mockResolvedValue({ id: 'm-new' }),
        },
        emailThread: {
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn().mockResolvedValue({ participants: [] }),
          findMany: vi.fn().mockResolvedValue(candidates),
          create: threadCreate,
          update: vi.fn(),
        },
      },
      threadCreate,
    };
  }

  it('does NOT merge two strangers who happen to share a subject', async () => {
    // otro@y.com already owns a "Presupuesto" thread; cliente@x.com writes a
    // brand-new email with the same subject.
    const { tx, threadCreate } = subjectTx(
      [{ id: 't-de-otro', participants: ['otro@y.com'] }],
      [{ threadId: 't-de-otro', fromAddress: 'otro@y.com', toAddresses: ['box@acme.com'], ccAddresses: [] }],
    );
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail({ subject: 'Presupuesto' }));
    expect(res.threadId).toBe('t-new');
    expect(threadCreate).toHaveBeenCalledOnce();
  });

  it('does NOT merge even when the subject carries Re:, if the sender is a stranger', async () => {
    const { tx, threadCreate } = subjectTx(
      [{ id: 't-de-otro', participants: ['otro@y.com'] }],
      [{ threadId: 't-de-otro', fromAddress: 'otro@y.com', toAddresses: ['box@acme.com'], ccAddresses: [] }],
    );
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail({ subject: 'Re: Presupuesto' }));
    expect(res.threadId).toBe('t-new');
    expect(threadCreate).toHaveBeenCalledOnce();
  });

  it('never threads a bare subject by subject alone, not even for a participant', async () => {
    const { tx, threadCreate } = subjectTx(
      [{ id: 't-suyo', participants: ['cliente@x.com'] }],
      [{ threadId: 't-suyo', fromAddress: 'cliente@x.com', toAddresses: ['box@acme.com'], ccAddresses: [] }],
    );
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail({ subject: 'Presupuesto' }));
    expect(res.threadId).toBe('t-new');
    expect(threadCreate).toHaveBeenCalledOnce();
  });

  it('DOES thread a headerless reply from someone already in the thread', async () => {
    const { tx, threadCreate } = subjectTx(
      [{ id: 't-suyo', participants: ['cliente@x.com'] }],
      [{ threadId: 't-suyo', fromAddress: 'cliente@x.com', toAddresses: ['box@acme.com'], ccAddresses: [] }],
    );
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail({ subject: 'Re: Presupuesto' }));
    expect(res.threadId).toBe('t-suyo');
    expect(threadCreate).not.toHaveBeenCalled();
  });

  it('recognises a reply from someone who was only in Cc, case-insensitively', async () => {
    const { tx, threadCreate } = subjectTx(
      [{ id: 't-suyo', participants: ['ana@acme.test'] }],
      [
        {
          threadId: 't-suyo',
          fromAddress: 'ana@acme.test',
          toAddresses: ['box@acme.com'],
          ccAddresses: ['Cliente@X.com'],
        },
      ],
    );
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail({ subject: 'Re: Presupuesto' }));
    expect(res.threadId).toBe('t-suyo');
    expect(threadCreate).not.toHaveBeenCalled();
  });

  it('picks the most recent matching thread when several qualify', async () => {
    const { tx } = subjectTx(
      [
        { id: 't-reciente', participants: ['cliente@x.com'] },
        { id: 't-viejo', participants: ['cliente@x.com'] },
      ],
      [
        { threadId: 't-reciente', fromAddress: 'cliente@x.com', toAddresses: [], ccAddresses: [] },
        { threadId: 't-viejo', fromAddress: 'cliente@x.com', toAddresses: [], ccAddresses: [] },
      ],
    );
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail({ subject: 'Re: Presupuesto' }));
    expect(res.threadId).toBe('t-reciente');
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
      emailThread: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue({ participants: [] }), create: threadCreate, update: vi.fn() },
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
      emailThread: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue({ participants: [] }), create: threadCreate, update: vi.fn() },
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
      emailThread: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue({ participants: [] }), create: threadCreate, update },
    };
    const svc = makeService(tx);
    const res = await svc.ingest('t', 'conn1', baseEmail());
    expect(res.created).toBe(true);
    expect(res.threadId).toBe('t-new');
    expect(threadCreate).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });
});
