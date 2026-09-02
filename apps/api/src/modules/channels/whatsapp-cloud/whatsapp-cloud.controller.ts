import { Controller, Get, Headers, HttpCode, Post, Query, Req, Body } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@converflow/shared';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { ConversationIngestService } from '../../conversations/conversation-ingest.service.js';
import { WhatsappCloudService } from './whatsapp-cloud.service.js';
import { translateCloudWebhook } from './whatsapp-cloud.translate.js';

/**
 * Webhook público de WhatsApp Meta Cloud API (F2). Meta manda TODOS los
 * números de la cuenta al mismo webhook: el bot se resuelve por
 * phone_number_id (Bot.waPhoneNumberId) y desde ahí el contrato interno
 * ingestWhatsapp hace el resto — mismo camino que Baileys, sin tocar CRM.
 */
@Controller('webhooks/whatsapp')
export class WhatsappCloudController {
  private readonly logger = new Logger(WhatsappCloudController.name);

  constructor(
    private readonly cloud: WhatsappCloudService,
    private readonly prisma: PrismaService,
    private readonly ingest: ConversationIngestService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.cloud.verifyChallenge(mode, token, challenge);
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Body() body: unknown,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    if (!this.cloud.verifySignature(raw, signature)) throw new UnauthorizedError();

    const inbound = translateCloudWebhook(body);
    for (const item of inbound) {
      const bot = await this.prisma.bypass((tx) =>
        tx.bot.findUnique({ where: { waPhoneNumberId: item.phoneNumberId }, select: { id: true } }),
      );
      if (!bot) {
        this.logger.warn(`webhook cloud para phone_number_id desconocido ${item.phoneNumberId}`);
        continue;
      }
      await this.ingest.ingestWhatsapp(bot.id, item.event).catch((err) =>
        this.logger.warn({ err }, 'ingest cloud falló'),
      );
    }
    // Meta espera 200 SIEMPRE; los errores internos no deben provocar reintentos.
    return { received: inbound.length };
  }
}
