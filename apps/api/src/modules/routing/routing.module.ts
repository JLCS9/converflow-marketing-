import { Module } from '@nestjs/common';
import { RoutingService } from './routing.service.js';
import { RoutingController } from './routing.controller.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

/** Atención autónoma · Enrutado genérico a personas (todos los canales). */
@Module({
  controllers: [RoutingController],
  providers: [RoutingService, TenantAuthGuard],
  exports: [RoutingService],
})
export class RoutingModule {}
