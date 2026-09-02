import { Module } from '@nestjs/common';
import { ConsentsService } from './consents.service.js';

/** Consentimientos con evidencia (F1). Sin HTTP propio todavía: lo consumen
 *  el webchat (F2, fallback con consentimiento) y los playbooks (F3). */
@Module({
  providers: [ConsentsService],
  exports: [ConsentsService],
})
export class ConsentsModule {}
