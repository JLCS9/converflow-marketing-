import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller.js';
import { InboundService } from './inbound.service.js';
import { NotesModule } from '../notes/notes.module.js';

@Module({
  imports: [NotesModule],
  controllers: [InternalController],
  providers: [InboundService],
})
export class InternalModule {}
