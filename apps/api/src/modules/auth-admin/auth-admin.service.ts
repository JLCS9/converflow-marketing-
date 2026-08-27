import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import argon2 from 'argon2';
import QRCode from 'qrcode';
import {
  BadRequestError,
  Invalid2FAError,
  UnauthorizedError,
  adminLoginSchema,
  changePasswordSchema,
  constants,
  type AdminLoginInput,
  type ChangePasswordInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiry,
} from '../../common/auth/session.util.js';
import { encryptSecret, decryptSecret } from '../../common/utils/crypto.js';

/** A bare otplib secret is base32; anything else is one of our ciphertexts. */
const BASE32_RE = /^[A-Z2-7]+=*$/;

/**
 * Read a stored TOTP secret. New rows are AES-256-GCM ciphertext; rows written
 * before the secret was encrypted are still plaintext base32, so fall back to
 * them instead of locking those admins out of their own 2FA.
 */
function readTotpSecret(stored: string | null): string | null {
  if (!stored) return null;
  if (BASE32_RE.test(stored)) return stored; // legacy plaintext
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

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
      const secret = readTotpSecret(admin.totpSecret);
      if (!secret || !authenticator.check(totp, secret)) {
        throw new Invalid2FAError();
      }
      // Opportunistic migration: a legacy plaintext secret that just proved
      // itself gets re-stored encrypted.
      if (BASE32_RE.test(admin.totpSecret ?? '')) {
        await this.prisma
          .bypass((tx) =>
            tx.platformAdmin.update({
              where: { id: admin.id },
              data: { totpSecret: encryptSecret(secret) },
            }),
          )
          .catch(() => undefined);
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
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        totpEnabled: admin.totpEnabled,
        mustChangePassword: admin.mustChangePassword,
      },
    };
  }

  async findAdminForMe(adminId: string) {
    return this.prisma.bypass((tx) =>
      tx.platformAdmin.findUniqueOrThrow({
        where: { id: adminId },
        select: {
          id: true,
          email: true,
          name: true,
          totpEnabled: true,
          mustChangePassword: true,
        },
      }),
    );
  }

  async changePassword(
    input: ChangePasswordInput,
    ctx: { adminId: string; ip?: string },
  ): Promise<void> {
    const { currentPassword, newPassword } = changePasswordSchema.parse(input);
    if (currentPassword === newPassword) {
      throw new BadRequestError('La nueva contraseña debe ser distinta');
    }

    const admin = await this.prisma.bypass((tx) =>
      tx.platformAdmin.findUniqueOrThrow({ where: { id: ctx.adminId } }),
    );
    if (!(await argon2.verify(admin.passwordHash, currentPassword))) {
      throw new UnauthorizedError('Contraseña actual incorrecta');
    }

    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.bypass(async (tx) => {
      await tx.platformAdmin.update({
        where: { id: ctx.adminId },
        data: { passwordHash: hash, mustChangePassword: false },
      });
      await tx.platformAdminSession.deleteMany({ where: { adminId: ctx.adminId } });
      await tx.adminActionLog.create({
        data: {
          adminId: ctx.adminId,
          action: 'change_password',
          targetType: 'admin',
          targetId: ctx.adminId,
          ip: ctx.ip,
        },
      });
    });
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
        data: { totpSecret: encryptSecret(secret), totpEnabled: false },
      }),
    );

    return { uri, qrPng };
  }

  async verify2faEnrollment(adminId: string, code: string) {
    const admin = await this.prisma.bypass(async (tx) =>
      tx.platformAdmin.findUniqueOrThrow({ where: { id: adminId } }),
    );
    const secret = readTotpSecret(admin.totpSecret);
    if (!secret || !authenticator.check(code, secret)) {
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
