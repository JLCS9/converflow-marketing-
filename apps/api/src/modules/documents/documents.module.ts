import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, S3Service, TenantAuthGuard],
})
export class DocumentsModule {}
