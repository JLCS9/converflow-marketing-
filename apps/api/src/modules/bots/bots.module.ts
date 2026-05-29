import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller.js';
import { BotRunnerService } from './bot-runner.service.js';
import { EmailModule } from '../email/email.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [EmailModule],
  controllers: [BotsController],
  providers: [BotRunnerService, TenantAuthGuard],
  exports: [BotRunnerService],
})
export class BotsModule {}
