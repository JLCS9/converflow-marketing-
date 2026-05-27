import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { R2Service } from '../../common/storage/r2.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, R2Service, TenantAuthGuard],
})
export class DocumentsModule {}
