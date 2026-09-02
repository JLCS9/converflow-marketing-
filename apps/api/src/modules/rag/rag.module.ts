import { Module } from '@nestjs/common';
import { RagService } from './rag.service.js';

/**
 * Memoria vectorial por tenant (F0: servicio base; F2 añade colecciones
 * gestionadas, cola `embed` y recuperación con segmentos en el ensamblado
 * de contexto). Sin controller a propósito: todavía no hay superficie HTTP.
 */
@Module({
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
