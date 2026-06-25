import { describe, it, expect } from 'vitest';
import { createMailDriver } from './index.js';
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
