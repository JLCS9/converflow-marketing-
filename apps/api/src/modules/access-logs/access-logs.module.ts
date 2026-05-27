import { Module } from '@nestjs/common';
import { AccessLogsController } from './access-logs.controller.js';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard.js';

@Module({
  controllers: [AccessLogsController],
  providers: [AdminAuthGuard],
})
export class AccessLogsModule {}
