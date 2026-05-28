import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller.js';
import { ConversationsModule } from '../conversations/conversations.module.js';

@Module({
  imports: [ConversationsModule],
  controllers: [InternalController],
})
export class InternalModule {}
