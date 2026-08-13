import { describe, it, expect, vi } from 'vitest';

// The real driver talks SMTP/IMAP over the network — replace it with a stub.
vi.mock('./drivers/index.js', () => ({
  createMailDriver: () => ({ send: vi.fn().mockResolvedValue({ id: '<sent@cf>' }) }),
}));

import {
  MailComposeService,
  parseAddressList,
  buildForwardBody,
} from './mail-compose.service.js';

const CONN = {
  driver: 'smtp_imap',
  fromAddress: 'box@acme.com',
  displayName: 'Acme',
  smtpHost: 'smtp.acme.com',
  smtpPort: 465,
  imapHost: 'imap.acme.com',
  imapPort: 993,
  username: 'box@acme.com',
  secretEnc: null,
  secure: true,
};

/** prisma stub whose withTenant runs the callback with the provided fake tx. */
function makeService(tx: Record<string, unknown>) {
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx),
  } as never;
  const connections = { assertAccess: vi.fn().mockResolvedValue(CONN) } as never;
  const attachments = {
    presignForSend: vi.fn().mockResolvedValue([]),
    presignForMessage: vi.fn().mockResolvedValue([]),
  } as never;
  return new MailComposeService(prisma, connections, attachments);
}

const actor = { userId: 'u1', role: 'OWNER' };

describe('parseAddressList', () => {
  it('splits, lowercases, dedupes and drops invalid', () => {
    expect(parseAddressList('A@x.com, b@y.com; A@x.com\nnope')).toEqual([
      'a@x.com',
      'b@y.com',
    ]);
  });
  it('accepts arrays and empty/null', () => {
    expect(parseAddressList(['c@z.com', 'bad'])).toEqual(['c@z.com']);
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList(null)).toEqual([]);
  });
});

describe('buildForwardBody', () => {
  it('prepends the intro and quotes the original with a forwarded header', () => {
    const out = buildForwardBody(
      { fromName: 'Cliente', fromAddress: 'cli@x.com', subject: 'Pedido', html: '<p>Hola</p>' },
      '<p>Te reenvío</p>',
    );
    expect(out).toContain('Te reenvío');
    expect(out).toContain('Mensaje reenviado');
    expect(out).toContain('cli@x.com');
    expect(out).toContain('<p>Hola</p>');
  });
  it('escapes text bodies when there is no html', () => {
    const out = buildForwardBody({ fromAddress: 'a@b.com', text: '1 < 2 & 3' });
    expect(out).toContain('1 &lt; 2 &amp; 3');
  });
});

describe('MailComposeService.reply', () => {
  it('defaults the recipient to the last inbound sender', async () => {
    const created: Record<string, unknown>[] = [];
    const tx = {
      emailThread: {
        findUnique: vi.fn().mockResolvedValue({
          id: 't1',
          connectionId: 'c1',
          subject: 'Pedido',
          participants: ['cli@x.com'],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      emailMessage: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ direction: 'IN', fromAddress: 'cli@x.com', rfcMessageId: '<a@x>' }),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'm-out' };
        }),
      },
    };
    const svc = makeService(tx);
    const res = await svc.reply('tenant', 't1', actor, { html: '<p>Vale</p>' });
    expect(res).toMatchObject({ ok: true, threadId: 't1' });
    expect(created[0]!.toAddresses).toEqual(['cli@x.com']);
    expect(created[0]!.subject).toBe('Re: Pedido');
  });

  it('rejects an empty body', async () => {
    const tx = {
      emailThread: { findUnique: vi.fn().mockResolvedValue({ id: 't1', connectionId: 'c1' }) },
      emailMessage: { findFirst: vi.fn() },
    };
    const svc = makeService(tx);
    await expect(svc.reply('tenant', 't1', actor, { html: '   ' })).rejects.toThrow();
  });

  it('drops our own address and duplicates from cc', async () => {
    const created: Record<string, unknown>[] = [];
    const tx = {
      emailThread: {
        findUnique: vi.fn().mockResolvedValue({
          id: 't1',
          connectionId: 'c1',
          subject: 'Hi',
          participants: ['cli@x.com'],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      emailMessage: {
        findFirst: vi.fn().mockResolvedValue({ direction: 'IN', fromAddress: 'cli@x.com' }),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'm-out' };
        }),
      },
    };
    const svc = makeService(tx);
    await svc.reply('tenant', 't1', actor, {
      html: '<p>x</p>',
      cc: 'box@acme.com, cli@x.com, third@z.com',
    });
    expect(created[0]!.ccAddresses).toEqual(['third@z.com']);
  });
});

describe('MailComposeService.forward', () => {
  it('uses the caller-provided subject when present', async () => {
    const created: Record<string, unknown>[] = [];
    const tx = {
      emailMessage: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'm1',
          connectionId: 'c1',
          fromName: 'Cliente',
          fromAddress: 'cli@x.com',
          subject: 'Pedido',
          html: '<p>Hola</p>',
        }),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'm-out' };
        }),
      },
      emailThread: {
        create: vi.fn().mockResolvedValue({ id: 't-new' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const svc = makeService(tx);
    await svc.forward('tenant', 'm1', actor, { to: 'dest@z.com', subject: 'Mi asunto' });
    expect(created[0]!.subject).toBe('Mi asunto');
  });

  it('falls back to Fwd: <original> when no subject is given', async () => {
    const created: Record<string, unknown>[] = [];
    const tx = {
      emailMessage: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'm1',
          connectionId: 'c1',
          fromAddress: 'cli@x.com',
          subject: 'Re: Pedido',
          html: '<p>Hola</p>',
        }),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'm-out' };
        }),
      },
      emailThread: {
        create: vi.fn().mockResolvedValue({ id: 't-new' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const svc = makeService(tx);
    await svc.forward('tenant', 'm1', actor, { to: 'dest@z.com' });
    expect(created[0]!.subject).toBe('Fwd: Pedido');
  });
});

describe('MailComposeService.sendDraft', () => {
  /** tx stub for sending a draft: reply draft (empty subject) on a thread with subject. */
  function draftTx(draft: Record<string, unknown>, thread: Record<string, unknown>, last: Record<string, unknown> | null) {
    const updates: Record<string, unknown>[] = [];
    const tx = {
      emailMessage: {
        findUnique: vi.fn().mockResolvedValue(draft),
        findFirst: vi.fn().mockResolvedValue(last),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return {};
        }),
      },
      emailThread: {
        findUnique: vi.fn().mockResolvedValue(thread),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    return { tx, updates };
  }

  it('derives "Re: <thread subject>" when a reply draft has an empty subject', async () => {
    const { tx, updates } = draftTx(
      { id: 'd1', isDraft: true, connectionId: 'c1', threadId: 't1', subject: '', html: '<p>Vale</p>', toAddresses: ['cli@x.com'], ccAddresses: [], bccAddresses: [] },
      { id: 't1', subject: 'Pedido', folder: 'INBOX' },
      { rfcMessageId: '<a@x>', references: null },
    );
    const svc = makeService(tx);
    await svc.sendDraft('tenant', 'd1', actor);
    expect(updates[0]!.subject).toBe('Re: Pedido');
  });

  it('keeps the typed subject on a new-compose draft', async () => {
    const { tx, updates } = draftTx(
      { id: 'd1', isDraft: true, connectionId: 'c1', threadId: 't1', subject: 'Hola equipo', html: '<p>x</p>', toAddresses: ['cli@x.com'], ccAddresses: [], bccAddresses: [] },
      { id: 't1', subject: null, folder: 'DRAFTS' },
      null,
    );
    const svc = makeService(tx);
    await svc.sendDraft('tenant', 'd1', actor);
    expect(updates[0]!.subject).toBe('Hola equipo');
  });
});

describe('MailComposeService.compose', () => {
  it('rejects when there is no valid recipient', async () => {
    const svc = makeService({});
    await expect(
      svc.compose('tenant', 'c1', actor, { to: 'not-an-email', subject: 'Hi', html: '<p>x</p>' }),
    ).rejects.toThrow();
  });

  it('rejects when the subject is missing', async () => {
    const svc = makeService({});
    await expect(
      svc.compose('tenant', 'c1', actor, { to: 'a@b.com', subject: '', html: '<p>x</p>' }),
    ).rejects.toThrow();
  });
});
