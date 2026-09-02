import { Module } from '@nestjs/common';
import { LifecycleService } from './lifecycle.service.js';

/** Ciclo de vida configurable por tenant (F1). */
@Module({
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
