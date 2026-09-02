import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service.js';
import { EnrichmentService } from './enrichment.service.js';
import { ProfilesController } from './profiles.controller.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

/** Perfil unificado del contacto (F0: esqueleto; F1: identidad; F3: enriquecimiento). */
@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService, EnrichmentService, TenantAuthGuard],
  exports: [ProfilesService, EnrichmentService],
})
export class ProfilesModule {}
