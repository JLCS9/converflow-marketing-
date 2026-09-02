import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module.js';
import { IngestModule } from '../ingest/ingest.module.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';

/** Memoria gestionada del tenant (F2): conocimiento, respuestas verificadas,
 *  instrucciones y lagunas. */
@Module({
  imports: [RagModule, IngestModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
