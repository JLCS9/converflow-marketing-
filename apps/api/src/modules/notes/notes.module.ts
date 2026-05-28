import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';

@Module({
  controllers: [NotesController],
  providers: [NotesService, TenantAuthGuard],
  exports: [NotesService],
})
export class NotesModule {}
