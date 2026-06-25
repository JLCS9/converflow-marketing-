import { Module } from '@nestjs/common';
import { MailConnectionsController } from './mail-connections.controller.js';
import { MailInboxController } from './mail-inbox.controller.js';
import { MailConnectionsService } from './mail-connections.service.js';
import { MailIngestService } from './mail-ingest.service.js';
import { MailSyncService } from './mail-sync.service.js';
import { MailInboxService } from './mail-inbox.service.js';
import { MailComposeService } from './mail-compose.service.js';
import { MailAttachmentsService } from './mail-attachments.service.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

/**
 * Mail module — independent of Bots/Agents.
 * Fase 1: mailbox connections (configurator).
 * Fase 2.1: receive pipeline (sync → ingest → threading).
 * Fase 2.2: inbox read API (folders, threads, read-state, move).
 */
@Module({
  controllers: [MailConnectionsController, MailInboxController],
  providers: [
    MailConnectionsService,
    MailIngestService,
    MailSyncService,
    MailInboxService,
    MailComposeService,
    MailAttachmentsService,
    S3Service,
    TenantAuthGuard,
  ],
  exports: [MailConnectionsService, MailIngestService, MailSyncService],
})
export class MailModule {}
