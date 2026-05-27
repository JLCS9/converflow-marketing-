import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TenantAuthGuard],
  exports: [AuthService, TenantAuthGuard],
})
export class AuthModule {}
