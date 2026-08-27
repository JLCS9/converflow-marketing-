import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { AiBudgetService } from './ai-budget.service.js';

@Global()
@Module({
  providers: [AiService, AiBudgetService],
  exports: [AiService, AiBudgetService],
})
export class AiModule {}
