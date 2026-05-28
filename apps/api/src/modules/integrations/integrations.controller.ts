import { Controller, Delete, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { IntegrationsService } from './integrations.service.js';
import { env } from '../../config/env.js';

@ApiTags('integrations')
@Controller('integrations/google')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @UseGuards(TenantAuthGuard)
  @Get('connect')
  connect(@CurrentUser() user: AuthenticatedUser) {
    return { url: this.integrations.getAuthUrl(user.userId, user.tenantId) };
  }

  @UseGuards(TenantAuthGuard)
  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.getStatus(user.tenantId, user.userId);
  }

  @UseGuards(TenantAuthGuard)
  @Delete()
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.disconnect(user.tenantId, user.userId);
  }

  // Public: hit by Google's browser redirect. Authorization is carried by the
  // signed `state` param, not the session cookie.
  @Get('callback')
  async callback(
    @Res() res: FastifyReply,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    let target: string;
    if (error || !code || !state) {
      target = `${env.WEB_PUBLIC_URL}/app/settings?google=${error ? 'denied' : 'error'}`;
    } else {
      target = await this.integrations.handleCallback(code, state);
    }
    res.status(302).header('location', target).send();
  }
}
