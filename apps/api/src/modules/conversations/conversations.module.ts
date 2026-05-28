import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationIngestService } from './conversation-ingest.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationIngestService, TenantAuthGuard],
  exports: [ConversationIngestService],
})
export class ConversationsModule {}
