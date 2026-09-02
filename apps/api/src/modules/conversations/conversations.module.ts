import { Module } from '@nestjs/common';
import { WhatsappCloudController } from '../channels/whatsapp-cloud/whatsapp-cloud.controller.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationIngestService } from './conversation-ingest.service.js';
import { BotsModule } from '../bots/bots.module.js';
import { ConversationEngineModule } from '../conversation-engine/conversation-engine.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { EmailModule } from '../email/email.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [BotsModule, DocumentsModule, AgentsModule, EmailModule, ConversationEngineModule, ProfilesModule],
  controllers: [ConversationsController, WhatsappCloudController],
  providers: [ConversationsService, ConversationIngestService, TenantAuthGuard],
  exports: [ConversationIngestService],
})
export class ConversationsModule {}
