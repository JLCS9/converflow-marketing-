import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [MeController],
  providers: [TenantAuthGuard],
})
export class MeModule {}
