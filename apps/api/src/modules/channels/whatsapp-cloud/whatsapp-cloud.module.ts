import { Global, Module } from '@nestjs/common';
import { WhatsappCloudService } from './whatsapp-cloud.service.js';

/**
 * WhatsApp Meta Cloud API (F2). @Global para que BotRunnerService pueda
 * delegar el envío sin ciclos de módulos; el webhook (controller) vive en
 * ConversationsModule porque necesita la ingesta.
 */
@Global()
@Module({
  providers: [WhatsappCloudService],
  exports: [WhatsappCloudService],
})
export class WhatsappCloudModule {}
