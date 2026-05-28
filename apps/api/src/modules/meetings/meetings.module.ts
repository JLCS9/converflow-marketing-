import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller.js';
import { MeetingsService } from './meetings.service.js';
import { GoogleModule } from '../../common/google/google.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [GoogleModule, IntegrationsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, TenantAuthGuard],
})
export class MeetingsModule {}
