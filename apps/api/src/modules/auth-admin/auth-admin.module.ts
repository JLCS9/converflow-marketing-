import { Module } from '@nestjs/common';
import { AuthAdminController } from './auth-admin.controller.js';
import { AuthAdminService } from './auth-admin.service.js';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard.js';

@Module({
  controllers: [AuthAdminController],
  providers: [AuthAdminService, AdminAuthGuard],
  exports: [AuthAdminService, AdminAuthGuard],
})
export class AuthAdminModule {}
