import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthAdminService } from './auth-admin.service.js';
import {
  ADMIN_SESSION_COOKIE,
  AdminAuthGuard,
} from '../../common/guards/admin-auth.guard.js';
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from '../../common/decorators/current-user.decorator.js';
import { env } from '../../config/env.js';

@ApiTags('admin/auth')
@Controller('admin/auth')
export class AuthAdminController {
  constructor(private readonly auth: AuthAdminService) {}

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
    if (result.requires2fa) {
      return { requires2fa: true };
    }
    this.setSessionCookie(res, result.token, result.expiresAt);
    return { admin: result.admin };
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return { admin };
  }

  @UseGuards(AdminAuthGuard)
  @Post('logout')
  async logout(
    @Req() req: FastifyRequest & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.cookies?.[ADMIN_SESSION_COOKIE];
    if (token) await this.auth.logout(token);
    res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @UseGuards(AdminAuthGuard)
  @Post('2fa/enroll')
  async enroll2fa(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.auth.start2faEnrollment(admin.adminId);
  }

  @UseGuards(AdminAuthGuard)
  @Post('2fa/verify')
  async verify2fa(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() body: { code: string },
  ) {
    return this.auth.verify2faEnrollment(admin.adminId, body.code);
  }

  private setSessionCookie(res: FastifyReply, token: string, expiresAt: Date) {
    res.setCookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      // In production share the cookie across api.* / admin.* / app.* subdomains.
      domain: env.NODE_ENV === 'production' ? '.converflow.ai' : undefined,
    });
  }
}
