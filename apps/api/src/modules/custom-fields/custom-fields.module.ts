import { Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller.js';
import { CustomFieldsService } from './custom-fields.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService, TenantAuthGuard],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
