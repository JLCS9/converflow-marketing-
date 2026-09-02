import { Module } from '@nestjs/common';
import { AiReportsService } from './ai-reports.service.js';
import { AiReportsController } from './ai-reports.controller.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

/** F4 · Informe mensual con curva de mejora (Batch API). */
@Module({
  controllers: [AiReportsController],
  providers: [AiReportsService, TenantAuthGuard],
  exports: [AiReportsService],
})
export class AiReportsModule {}
