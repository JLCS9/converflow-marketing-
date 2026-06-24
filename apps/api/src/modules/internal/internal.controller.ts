import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard.js';
import { ConversationIngestService } from '../conversations/conversation-ingest.service.js';

// Internal routes (bot-runner / email provider webhooks). Docker network only,
// authenticated with the shared x-internal-token. NOT behind the session guard.
@ApiTags('internal')
@UseGuards(InternalTokenGuard)
@Controller('internal')
export class InternalController {
  constructor(private readonly ingest: ConversationIngestService) {}

  @Post('bots/:botId/inbound')
  handleInbound(@Param('botId') botId: string, @Body() body: unknown) {
    return this.ingest.ingestWhatsapp(botId, body);
  }

  // Inbound email — point your provider's webhook here with the documented
  // JSON shape { to, from, fromName?, subject?, text?, html?, messageId? }.
  @Post('email/inbound')
  handleEmailInbound(
    @Body()
    body: {
      to?: string;
      from?: string;
      fromName?: string;
      subject?: string;
      text?: string;
      html?: string;
      messageId?: string;
    },
  ) {
    return this.ingest.ingestEmail(body);
  }
}
