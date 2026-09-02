import { Module } from '@nestjs/common';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { VerticalsController } from './verticals.controller.js';
import { VerticalsService } from './verticals.service.js';

/** Plantillas de vertical (F1): siembran campos, ciclo de vida e
 *  instrucciones de ejemplo por tipo de negocio. */
@Module({
  imports: [LifecycleModule],
  controllers: [VerticalsController],
  providers: [VerticalsService],
  exports: [VerticalsService],
})
export class VerticalsModule {}
