import { Module } from '@nestjs/common';
import { AdminBotsController } from './admin-bots.controller.js';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard.js';

@Module({
  controllers: [AdminBotsController],
  providers: [AdminAuthGuard],
})
export class AdminBotsModule {}
