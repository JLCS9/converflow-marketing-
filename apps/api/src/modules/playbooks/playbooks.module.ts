import { Module } from '@nestjs/common';
import { PlaybooksService } from './playbooks.service.js';
import { PlaybooksController } from './playbooks.controller.js';
import { ConsentsModule } from '../consents/consents.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

/**
 * F3 · Acciones automáticas con guardarraíles y borrador-para-aprobar.
 * Depende de conversations SOLO para entregar el mensaje aprobado por el
 * canal de la conversación existente.
 */
@Module({
  imports: [ConsentsModule, ConversationsModule],
  controllers: [PlaybooksController],
  providers: [PlaybooksService, TenantAuthGuard],
  exports: [PlaybooksService],
})
export class PlaybooksModule {}
