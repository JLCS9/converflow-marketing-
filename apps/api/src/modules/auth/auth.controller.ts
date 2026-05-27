import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import {
  TENANT_SESSION_COOKIE,
  TenantAuthGuard,
} from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { env } from '../../config/env.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.auth.login(body as never, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setSessionCookie(res, result.token, result.expiresAt);
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        tenantId: result.user.tenantId,
        mustChangePassword: result.user.mustChangePassword,
      },
    };
  }

  @Post('signup')
  async signup(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.auth.signup(body as never, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setSessionCookie(res, result.token, result.expiresAt);
    return {
      tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
    };
  }

  @UseGuards(TenantAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    // Include mustChangePassword from DB (not stored in the cookie).
    const u = await this.auth.findUserForMe(user.userId);
    return { user: { ...user, mustChangePassword: u.mustChangePassword } };
  }

  @UseGuards(TenantAuthGuard)
  @Post('change-password')
  async changePassword(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.auth.changePassword(body as never, {
      userId: user.userId,
      tenantId: user.tenantId,
      email: user.email,
      ip: req.ip,
    });
    // We invalidated all sessions including current. Clear cookie too.
    res.clearCookie(TENANT_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @UseGuards(TenantAuthGuard)
  @Post('logout')
  async logout(
    @Req() req: FastifyRequest & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.cookies?.[TENANT_SESSION_COOKIE];
    if (token) await this.auth.logout(token, { ip: req.ip });
    res.clearCookie(TENANT_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  private setSessionCookie(res: FastifyReply, token: string, expiresAt: Date) {
    res.setCookie(TENANT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      domain: env.NODE_ENV === 'production' ? '.converflow.ai' : undefined,
    });
  }
}
