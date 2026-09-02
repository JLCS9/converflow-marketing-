import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { IngestController } from './ingest.controller.js';
import { IngestService } from './ingest.service.js';

/** Plano de datos: POST /events + (F1) adaptadores de webhook por fuente. */
@Module({
  imports: [ProfilesModule],
  controllers: [IngestController],
  providers: [IngestService],
  exports: [IngestService],
})
export class IngestModule {}
