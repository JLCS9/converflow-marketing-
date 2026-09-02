import { Module } from '@nestjs/common';
import { ConsentsModule } from '../consents/consents.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { RagModule } from '../rag/rag.module.js';
import { IngestController } from './ingest.controller.js';
import { SourcesController } from './sources.controller.js';
import { WebhooksController } from './webhooks.controller.js';
import { IngestQueueModule } from './ingest-queue.module.js';
import { IngestService } from './ingest.service.js';
import { PlaybooksModule } from '../playbooks/playbooks.module.js';
import { AiReportsModule } from '../ai-reports/ai-reports.module.js';

/** Plano de datos: POST /events → cola data-plane → identidad + evento +
 *  ciclo de vida. Los adaptadores por fuente (Brevo, LearnDash…) llegan en
 *  la segunda entrega de F1. */
@Module({
  imports: [IngestQueueModule, ProfilesModule, LifecycleModule, ConsentsModule, RagModule, PlaybooksModule, AiReportsModule],
  controllers: [IngestController, SourcesController, WebhooksController],
  providers: [IngestService],
  exports: [IngestService, IngestQueueModule],
})
export class IngestModule {}
