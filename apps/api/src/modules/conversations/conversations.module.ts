import { Module } from '@nestjs/common';
import { WhatsappCloudController } from '../channels/whatsapp-cloud/whatsapp-cloud.controller.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationIngestService } from './conversation-ingest.service.js';
import { ConversationAiService } from './conversation-ai.service.js';
import { ConversationDeliveryService } from './conversation-delivery.service.js';
import { CrmActionsService } from './crm-actions.service.js';
import { BotsModule } from '../bots/bots.module.js';
import { ConversationEngineModule } from '../conversation-engine/conversation-engine.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { IngestQueueModule } from '../ingest/ingest-queue.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { EmailModule } from '../email/email.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [BotsModule, DocumentsModule, AgentsModule, EmailModule, ConversationEngineModule, ProfilesModule, IngestQueueModule, KnowledgeModule],
  controllers: [ConversationsController, WhatsappCloudController],
  providers: [ConversationsService, ConversationIngestService, ConversationAiService, ConversationDeliveryService, CrmActionsService, TenantAuthGuard],
  exports: [ConversationIngestService, ConversationsService, ConversationDeliveryService],
})
export class ConversationsModule {}
