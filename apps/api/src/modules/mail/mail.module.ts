import { Module } from '@nestjs/common';
import { MailConnectionsController } from './mail-connections.controller.js';
import { MailConnectionsService } from './mail-connections.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

/**
 * Mail module — independent of Bots/Agents (Fase 1: mailbox connections).
 * Owns the "Buzones / Correo" configurator. Drivers abstract the transport.
 */
@Module({
  controllers: [MailConnectionsController],
  providers: [MailConnectionsService, TenantAuthGuard],
  exports: [MailConnectionsService],
})
export class MailModule {}
