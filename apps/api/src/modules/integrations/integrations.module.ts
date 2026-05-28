import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationsService } from './integrations.service.js';
import { GoogleModule } from '../../common/google/google.module.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  imports: [GoogleModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, TenantAuthGuard],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
