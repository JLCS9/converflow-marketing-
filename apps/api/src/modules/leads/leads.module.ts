import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module.js';

@Module({
  imports: [CustomFieldsModule],
  controllers: [LeadsController],
  providers: [LeadsService, TenantAuthGuard],
})
export class LeadsModule {}
