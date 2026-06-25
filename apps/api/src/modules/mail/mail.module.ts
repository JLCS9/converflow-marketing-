import { Module } from '@nestjs/common';
import { MailConnectionsController } from './mail-connections.controller.js';
import { MailConnectionsService } from './mail-connections.service.js';
import { MailIngestService } from './mail-ingest.service.js';
import { MailSyncService } from './mail-sync.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

/**
 * Mail module — independent of Bots/Agents.
 * Fase 1: mailbox connections (configurator).
 * Fase 2.1: receive pipeline (sync → ingest → threading).
 */
@Module({
  controllers: [MailConnectionsController],
  providers: [MailConnectionsService, MailIngestService, MailSyncService, TenantAuthGuard],
  exports: [MailConnectionsService, MailIngestService, MailSyncService],
})
export class MailModule {}
