import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module.js';
import { PipelinesModule } from '../pipelines/pipelines.module.js';
import { ScoringRunner } from '../agents/agent-runners/scoring.js';

@Module({
  imports: [CustomFieldsModule, PipelinesModule],
  controllers: [LeadsController],
  providers: [LeadsService, ScoringRunner, TenantAuthGuard],
})
export class LeadsModule {}
