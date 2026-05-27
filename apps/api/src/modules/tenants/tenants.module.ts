import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller.js';
import { TenantsService } from './tenants.service.js';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard.js';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, AdminAuthGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
