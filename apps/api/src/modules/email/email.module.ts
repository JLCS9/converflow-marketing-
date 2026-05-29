import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { EmailConnectionService } from './email-connection.service.js';

@Module({
  providers: [EmailService, EmailConnectionService],
  exports: [EmailService, EmailConnectionService],
})
export class EmailModule {}
