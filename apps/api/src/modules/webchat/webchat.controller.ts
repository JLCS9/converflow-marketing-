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

  @Post(':botId/messages')
  send(
    @Param('botId') botId: string,
    @Body() body: { sessionId?: string; text?: string; visitorName?: string },
  ) {
    return this.ingest.ingestWebchat(botId, {
      sessionId: String(body?.sessionId ?? ''),
      text: String(body?.text ?? ''),
      visitorName: body?.visitorName ? String(body.visitorName) : undefined,
    });
  }

  @Get(':botId/messages')
  list(@Param('botId') botId: string, @Query('sessionId') sessionId?: string) {
    return this.ingest.getWebchatMessages(botId, sessionId ?? '');
  }
}
