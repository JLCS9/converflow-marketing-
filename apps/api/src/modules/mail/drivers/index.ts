import { AppError } from '@converflow/shared';
import { SmtpImapDriver } from './smtp-imap.driver.js';
import type { DriverConfig, MailDriver } from './mail-driver.js';

export * from './mail-driver.js';

/** Build the driver for a connection. Fase 1 ships smtp_imap only. */
export function createMailDriver(cfg: DriverConfig): MailDriver {
  switch (cfg.driver) {
    case 'SMTP_IMAP':
      return new SmtpImapDriver(cfg);
    default:
      throw new AppError(
        'BAD_REQUEST',
        `Driver "${cfg.driver}" todavía no está disponible (llega en una fase posterior).`,
        400,
      );
  }
}
