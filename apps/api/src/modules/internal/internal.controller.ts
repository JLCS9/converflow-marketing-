import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard.js';
import { InboundService } from './inbound.service.js';

// Internal routes called by the bot-runner (Docker network only), authenticated
// with the shared x-internal-token. NOT behind the tenant session guard.
@ApiTags('internal')
@UseGuards(InternalTokenGuard)
@Controller('internal/bots')
export class InternalController {
  constructor(private readonly inbound: InboundService) {}

  @Post(':botId/inbound')
  handleInbound(@Param('botId') botId: string, @Body() body: unknown) {
    return this.inbound.handleWhatsappInbound(botId, body as never);
  }
}
