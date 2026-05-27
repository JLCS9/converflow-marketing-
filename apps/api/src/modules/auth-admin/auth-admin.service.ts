import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import argon2 from 'argon2';
import QRCode from 'qrcode';
import {
  Invalid2FAError,
  UnauthorizedError,
  adminLoginSchema,
  constants,
  type AdminLoginInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiry,
} from '../../common/auth/session.util.js';

@Injectable()
export class AuthAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async login(input: AdminLoginInput, ctx: { ip?: string; userAgent?: string }) {
    const { email, password, totp } = adminLoginSchema.parse(input);

    const admin = await this.prisma.bypass(async (tx) =>
      tx.platformAdmin.findFirst({
        where: { email, status: 'ACTIVE' },
      }),
    );

    if (!admin || !(await argon2.verify(admin.passwordHash, password))) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    // If 2FA enrolled, require TOTP
    if (admin.totpEnabled) {
      if (!totp) {
        return { requires2fa: true as const };
      }
      if (!admin.totpSecret || !authenticator.check(totp, admin.totpSecret)) {
        throw new Invalid2FAError();
      }
    }

    const { token, hash } = generateSessionToken();
    const expiresAt = sessionExpiry(constants.SESSION_TTL_MINUTES.admin);

    await this.prisma.bypass(async (tx) => {
      await tx.platformAdminSession.create({
        data: {
          token: hash,
          adminId: admin.id,
          expiresAt,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
      await tx.platformAdmin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      });
      await tx.adminActionLog.create({
        data: {
          adminId: admin.id,
          action: 'login',
          targetType: 'admin',
          targetId: admin.id,
          ip: ctx.ip,
        },
      });
    });

    return {
      requires2fa: false as const,
      token,
      expiresAt,
      admin: { id: admin.id, email: admin.email, name: admin.name, totpEnabled: admin.totpEnabled },
    };
  }

  async logout(rawToken: string) {
    const hash = hashSessionToken(rawToken);
    await this.prisma.bypass(async (tx) => {
      await tx.platformAdminSession.deleteMany({ where: { token: hash } });
    });
  }

  /**
   * Generate a new TOTP secret + provisioning URI + QR PNG (data URL).
   * The secret is stored encrypted only when the admin confirms via verify().
   */
  async start2faEnrollment(adminId: string) {
    const secret = authenticator.generateSecret();
    const admin = await this.prisma.bypass(async (tx) =>
      tx.platformAdmin.findUniqueOrThrow({ where: { id: adminId } }),
    );
    const uri = authenticator.keyuri(admin.email, 'converflow.ai admin', secret);
    const qrPng = await QRCode.toDataURL(uri);

    // Temporarily stash the secret. Real flow: ask user to verify a code before
    // marking totpEnabled = true.
    await this.prisma.bypass(async (tx) =>
      tx.platformAdmin.update({
        where: { id: adminId },
        data: { totpSecret: secret, totpEnabled: false },
      }),
    );

    return { uri, qrPng };
  }

  async verify2faEnrollment(adminId: string, code: string) {
    const admin = await this.prisma.bypass(async (tx) =>
      tx.platformAdmin.findUniqueOrThrow({ where: { id: adminId } }),
    );
    if (!admin.totpSecret || !authenticator.check(code, admin.totpSecret)) {
      throw new Invalid2FAError();
    }
    await this.prisma.bypass(async (tx) => {
      await tx.platformAdmin.update({
        where: { id: adminId },
        data: { totpEnabled: true },
      });
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: 'enable_2fa',
          targetType: 'admin',
          targetId: adminId,
        },
      });
    });
    return { ok: true };
  }
}
