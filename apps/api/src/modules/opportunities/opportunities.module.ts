import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller.js';
import { OpportunitiesService } from './opportunities.service.js';
import { PurchaseOpportunityService } from './purchase-opportunity.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module.js';
import { PipelinesModule } from '../pipelines/pipelines.module.js';

@Module({
  imports: [CustomFieldsModule, PipelinesModule],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService, PurchaseOpportunityService, TenantAuthGuard],
  exports: [PurchaseOpportunityService],
})
export class OpportunitiesModule {}
