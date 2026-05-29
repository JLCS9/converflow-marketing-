import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller.js';
import { ConversationsModule } from '../conversations/conversations.module.js';

@Module({
  imports: [ConversationsModule],
  controllers: [WebchatController],
})
export class WebchatModule {}
