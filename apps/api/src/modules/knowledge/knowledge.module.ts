import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module.js';
import { IngestQueueModule } from '../ingest/ingest-queue.module.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';
import { RegressionService } from './regression.service.js';
import { SourceExtractService } from './source-extract.service.js';

/** Memoria gestionada del tenant (F2): conocimiento, respuestas verificadas,
 *  instrucciones y lagunas. */
@Module({
  imports: [RagModule, IngestQueueModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, RegressionService, SourceExtractService],
  exports: [KnowledgeService, RegressionService],
})
export class KnowledgeModule {}
