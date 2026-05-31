import { Module } from '@nestjs/common';
import { PipelinesController } from './pipelines.controller.js';
import { PipelinesService } from './pipelines.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [PipelinesController],
  providers: [PipelinesService, TenantAuthGuard],
  exports: [PipelinesService],
})
export class PipelinesModule {}
