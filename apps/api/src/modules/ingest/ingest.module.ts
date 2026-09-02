import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { IngestController } from './ingest.controller.js';
import { IngestQueue } from './ingest.queue.js';
import { IngestService } from './ingest.service.js';

/** Plano de datos: POST /events → cola data-plane → identidad + evento +
 *  ciclo de vida. Los adaptadores por fuente (Brevo, LearnDash…) llegan en
 *  la segunda entrega de F1. */
@Module({
  imports: [ProfilesModule, LifecycleModule],
  controllers: [IngestController],
  providers: [IngestService, IngestQueue],
  exports: [IngestService],
})
export class IngestModule {}
