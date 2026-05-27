import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [BotsController],
  providers: [TenantAuthGuard],
})
export class BotsModule {}
