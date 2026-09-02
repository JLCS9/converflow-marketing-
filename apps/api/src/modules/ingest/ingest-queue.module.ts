import { Module } from '@nestjs/common';
import { IngestQueue } from './ingest.queue.js';

/**
 * Módulo hoja con SOLO la cola del plano de datos. Existe para que módulos
 * que únicamente encolan (conversations, knowledge, playbooks) no arrastren
 * el módulo completo de ingesta — eso creaba ciclos de importación.
 */
@Module({
  providers: [IngestQueue],
  exports: [IngestQueue],
})
export class IngestQueueModule {}
