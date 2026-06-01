import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConversationIngestService } from '../conversations/conversation-ingest.service.js';

// PUBLIC endpoints for the embeddable web-chat widget. No tenant session — the
// :botId (channel WEBCHAT) is the public widget key; the visitor's sessionId
// scopes them to their own conversation.
@ApiTags('webchat')
@Controller('webchat')
export class WebchatController {
  constructor(private readonly ingest: ConversationIngestService) {}

  @Post(':botId/start')
  start(
    @Param('botId') botId: string,
    @Body() body: { sessionId?: string; name?: string; email?: string; phone?: string },
  ) {
    return this.ingest.startWebchat(botId, {
      sessionId: String(body?.sessionId ?? ''),
      name: String(body?.name ?? ''),
      email: body?.email ? String(body.email) : undefined,
      phone: body?.phone ? String(body.phone) : undefined,
    });
  }

  @Post(':botId/messages')
  send(
    @Param('botId') botId: string,
    @Body()
    body: { sessionId?: string; text?: string; visitorName?: string; visitorEmail?: string },
  ) {
    return this.ingest.ingestWebchat(botId, {
      sessionId: String(body?.sessionId ?? ''),
      text: String(body?.text ?? ''),
      visitorName: body?.visitorName ? String(body.visitorName) : undefined,
      visitorEmail: body?.visitorEmail ? String(body.visitorEmail) : undefined,
    });
  }

  @Get(':botId/messages')
  list(@Param('botId') botId: string, @Query('sessionId') sessionId?: string) {
    return this.ingest.getWebchatMessages(botId, sessionId ?? '');
  }
}
