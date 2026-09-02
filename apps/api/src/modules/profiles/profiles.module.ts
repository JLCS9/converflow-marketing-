import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service.js';

/** Perfil unificado del contacto (F0: esqueleto; F1: resolución de identidad). */
@Module({
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
