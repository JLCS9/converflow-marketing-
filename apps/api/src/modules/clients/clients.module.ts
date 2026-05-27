import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, TenantAuthGuard],
})
export class ClientsModule {}
