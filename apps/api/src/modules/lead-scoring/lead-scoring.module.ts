import { Module } from '@nestjs/common';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PipelinesModule } from '../pipelines/pipelines.module.js';
import { ScoringRunner } from '../agents/agent-runners/scoring.js';
import { LeadScoringController } from './lead-scoring.controller.js';
import { LeadScoringQueue } from './lead-scoring.queue.js';
import { LeadScoringService } from './lead-scoring.service.js';

@Module({
  imports: [PipelinesModule],
  controllers: [LeadScoringController],
  providers: [LeadScoringService, LeadScoringQueue, ScoringRunner, TenantAuthGuard],
})
export class LeadScoringModule {}
