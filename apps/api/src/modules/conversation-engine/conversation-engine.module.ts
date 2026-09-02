import { Module } from '@nestjs/common';
import { ConsentsModule } from '../consents/consents.module.js';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { ConversationEngineService } from './conversation-engine.service.js';

/** Motor conversacional con memoria del tenant (F2). */
@Module({
  imports: [KnowledgeModule, ConsentsModule, ProfilesModule, CustomFieldsModule],
  providers: [ConversationEngineService],
  exports: [ConversationEngineService],
})
export class ConversationEngineModule {}
