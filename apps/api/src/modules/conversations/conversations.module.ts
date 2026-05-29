import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationIngestService } from './conversation-ingest.service.js';
import { BotsModule } from '../bots/bots.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { EmailModule } from '../email/email.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [BotsModule, DocumentsModule, AgentsModule, EmailModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationIngestService, TenantAuthGuard],
  exports: [ConversationIngestService],
})
export class ConversationsModule {}
