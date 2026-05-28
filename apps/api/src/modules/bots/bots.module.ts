import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller.js';
import { BotRunnerService } from './bot-runner.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [BotsController],
  providers: [BotRunnerService, TenantAuthGuard],
})
export class BotsModule {}
