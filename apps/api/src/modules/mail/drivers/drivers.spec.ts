import { describe, it, expect } from 'vitest';
import { createMailDriver, resolveSecure, pickSentMailbox, providerAutoSavesSent } from './index.js';
import { SmtpImapDriver } from './smtp-imap.driver.js';

describe('createMailDriver', () => {
  const base = { fromAddress: 'a@b.com', smtpHost: 's', imapHost: 'i', username: 'u', secret: 'p' };

  it('returns an SmtpImapDriver for SMTP_IMAP', () => {
    const d = createMailDriver({ ...base, driver: 'SMTP_IMAP' });
    expect(d).toBeInstanceOf(SmtpImapDriver);
  });

  it('throws for drivers not yet implemented', () => {
    expect(() => createMailDriver({ ...base, driver: 'OAUTH_GOOGLE' })).toThrow();
    expect(() => createMailDriver({ ...base, driver: 'PROVIDER_API' })).toThrow();
  });
});

describe('resolveSecure', () => {
  it('honours an explicit per-transport setting over everything else', () => {
    expect(resolveSecure(false, 993, true)).toBe(false);
    expect(resolveSecure(true, 587, false)).toBe(true);
  });

  it('derives implicit TLS from the standard ports', () => {
    expect(resolveSecure(null, 993, false)).toBe(true); // IMAPS
    expect(resolveSecure(null, 465, false)).toBe(true); // SMTPS
    expect(resolveSecure(null, 587, true)).toBe(false); // SMTP STARTTLS
    expect(resolveSecure(null, 143, true)).toBe(false); // IMAP STARTTLS
    expect(resolveSecure(null, 25, true)).toBe(false);
  });

  it('falls back to the legacy flag only for non-standard ports', () => {
    expect(resolveSecure(null, 2525, false)).toBe(false);
    expect(resolveSecure(null, 2525, true)).toBe(true);
    expect(resolveSecure(null, null, null)).toBe(true); // safe default
  });

  it('fixes the Outlook/365 case that made those mailboxes unconnectable', () => {
    // One legacy flag had to be false for SMTP 587, which then forced the IMAP
    // 993 connection to skip TLS and fail. Port derivation gets both right.
    const legacy = false;
    expect(resolveSecure(null, 587, legacy)).toBe(false); // SMTP: STARTTLS
    expect(resolveSecure(null, 993, legacy)).toBe(true); // IMAP: implicit TLS
  });
});

describe('pickSentMailbox', () => {
  it('prefers the RFC 6154 \\Sent special-use flag (language-independent)', () => {
    const boxes = [
      { path: 'INBOX', name: 'INBOX' },
      { path: 'Elementos enviados', name: 'Elementos enviados', specialUse: '\\Sent' },
      { path: 'Sent', name: 'Sent' },
    ];
    expect(pickSentMailbox(boxes)).toBe('Elementos enviados');
  });

  it('falls back to well-known names when no flag is advertised', () => {
    expect(pickSentMailbox([{ path: 'INBOX.Sent', name: 'Sent' }])).toBe('INBOX.Sent');
    expect(pickSentMailbox([{ path: 'Enviados', name: 'Enviados' }])).toBe('Enviados');
    expect(pickSentMailbox([{ path: 'Sent Items', name: 'Sent Items' }])).toBe('Sent Items');
  });

  it('returns null rather than guessing when there is no Sent folder', () => {
    expect(pickSentMailbox([{ path: 'INBOX', name: 'INBOX' }])).toBeNull();
    expect(pickSentMailbox([])).toBeNull();
  });

  it('does not mistake Drafts or Trash for Sent', () => {
    expect(pickSentMailbox([{ path: 'Borradores', name: 'Borradores' }])).toBeNull();
    expect(pickSentMailbox([{ path: 'Trash', name: 'Trash' }])).toBeNull();
  });
});

describe('providerAutoSavesSent', () => {
  it('skips the append for Gmail, which files sent mail itself', () => {
    expect(providerAutoSavesSent('smtp.gmail.com')).toBe(true);
    expect(providerAutoSavesSent('smtp.googlemail.com')).toBe(true);
  });

  it('appends for providers that do not', () => {
    expect(providerAutoSavesSent('smtp.office365.com')).toBe(false);
    expect(providerAutoSavesSent('smtp.ionos.es')).toBe(false);
    expect(providerAutoSavesSent(null)).toBe(false);
    // Not fooled by a lookalike domain.
    expect(providerAutoSavesSent('smtp.notgmail.com.evil.net')).toBe(false);
  });
});
