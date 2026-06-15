import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller.js';
import { UnsubscribeController } from './unsubscribe.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { EmailModule } from '../email/email.module.js';
import { BotsModule } from '../bots/bots.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [EmailModule, BotsModule],
  controllers: [CampaignsController, UnsubscribeController],
  providers: [CampaignsService, TenantAuthGuard],
})
export class CampaignsModule {}
