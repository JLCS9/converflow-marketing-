import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { AgentRuntimeService } from './agent-runtime.service.js';
import { BotsModule } from '../bots/bots.module.js';
import { EmailModule } from '../email/email.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [BotsModule, EmailModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentRuntimeService, TenantAuthGuard],
  exports: [AgentsService, AgentRuntimeService],
})
export class AgentsModule {}
