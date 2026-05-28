import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { AgentRuntimeService } from './agent-runtime.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [AgentsController],
  providers: [AgentsService, AgentRuntimeService, TenantAuthGuard],
  exports: [AgentsService, AgentRuntimeService],
})
export class AgentsModule {}
