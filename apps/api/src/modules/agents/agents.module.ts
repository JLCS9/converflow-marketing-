import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { AgentRuntimeService } from './agent-runtime.service.js';
import { BotsModule } from '../bots/bots.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [BotsModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentRuntimeService, TenantAuthGuard],
  exports: [AgentsService, AgentRuntimeService],
})
export class AgentsModule {}
