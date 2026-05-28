import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { MeetingsService } from './meetings.service.js';

@ApiTags('meetings')
@UseGuards(TenantAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post('propose')
  propose(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.meetings.propose(user.tenantId, user.userId, body);
  }

  @Post('schedule')
  schedule(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.meetings.schedule(user.tenantId, user.userId, body);
  }
}
