import { Module } from '@nestjs/common';
import { AppVersionsController } from './app-versions.controller.js';

@Module({ controllers: [AppVersionsController] })
export class AppVersionsModule {}
