import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TenantAuthGuard],
})
export class TasksModule {}
