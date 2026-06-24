import { Module } from '@nestjs/common';
import { EmailTemplatesController } from './email-templates.controller.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [EmailTemplatesController],
  providers: [EmailTemplatesService, TenantAuthGuard],
})
export class EmailTemplatesModule {}
