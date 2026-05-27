import { Module } from '@nestjs/common';
import { AccessLogsController } from './access-logs.controller.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [AccessLogsController],
  providers: [TenantAuthGuard],
})
export class AccessLogsModule {}
