import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller.js';
import { OpportunitiesService } from './opportunities.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService, TenantAuthGuard],
})
export class OpportunitiesModule {}
