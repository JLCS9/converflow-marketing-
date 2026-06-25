import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { decryptSecret } from '../../common/utils/crypto.js';
import { createMailDriver } from './drivers/index.js';
import { MailIngestService } from './mail-ingest.service.js';

/**
 * Receive pipeline: per CONNECTED smtp_imap connection, fetch new INBOX mail by
 * UID cursor and hand each message to the ingest/threading service. Polls every
 * ~90s (single cfai-api instance). Cross-tenant scan via bypass; each sync runs
 * scoped to its tenant. Driver fetch + ingest run OUTSIDE request context.
 */
@Injectable()
export class MailSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: MailIngestService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 90_000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const conns = await this.prisma.bypass((tx) =>
        tx.mailConnection.findMany({
          where: { driver: 'SMTP_IMAP', status: 'CONNECTED' },
          select: { id: true, tenantId: true },
          take: 100,
        }),
      );
      for (const c of conns) {
        await this.syncConnection(c.tenantId, c.id).catch((err) =>
          this.logger.warn({ err, id: c.id }, 'mail sync failed'),
        );
      }
    } catch (err) {
      this.logger.warn({ err }, 'mail sync tick failed');
    } finally {
      this.running = false;
    }
  }

  /** Fetch + ingest new messages for one connection; advance the UID cursor. */
  async syncConnection(tenantId: string, connectionId: string) {
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.findUnique({ where: { id: connectionId } }),
    );
    if (!conn || conn.driver !== 'SMTP_IMAP') return { ingested: 0 };

    const driver = createMailDriver({
      driver: conn.driver,
      fromAddress: conn.fromAddress,
      displayName: conn.displayName,
      imapHost: conn.imapHost,
      imapPort: conn.imapPort,
      smtpHost: conn.smtpHost,
      smtpPort: conn.smtpPort,
      username: conn.username,
      secret: conn.secretEnc ? decryptSecret(conn.secretEnc) : null,
      secure: conn.secure,
    });

    try {
      const { messages, cursor } = await driver.fetchSince(conn.syncCursor);
      for (const m of messages) {
        await this.ingest.ingest(tenantId, connectionId, m);
      }
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.mailConnection.update({
          where: { id: connectionId },
          data: { syncCursor: cursor, lastSyncedAt: new Date(), status: 'CONNECTED', lastError: null },
        }),
      );
      return { ingested: messages.length };
    } catch (err) {
      await this.prisma
        .withTenant(tenantId, (tx) =>
          tx.mailConnection.update({
            where: { id: connectionId },
            data: { status: 'ERROR', lastError: String((err as Error)?.message ?? err).slice(0, 300) },
          }),
        )
        .catch(() => undefined);
      throw err;
    }
  }
}
