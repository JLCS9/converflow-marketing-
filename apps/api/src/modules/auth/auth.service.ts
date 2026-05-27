import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  changePasswordSchema,
  loginSchema,
  signupSchema,
  type ChangePasswordInput,
  type LoginInput,
  type SignupInput,
  constants,
} from '@converflow/shared';
import type { Tenant, User } from '@converflow/db';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  generateSessionToken,
  sessionExpiry,
} from '../../common/auth/session.util.js';

interface LoginResult {
  token: string;
  expiresAt: Date;
  user: User;
}

interface SignupResult {
  token: string;
  expiresAt: Date;
  tenant: Tenant;
  user: User;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(input: LoginInput, ctx: { ip?: string; userAgent?: string }): Promise<LoginResult> {
    const { email, password } = loginSchema.parse(input);

    // Same email can exist in multiple tenants (pool model). Try the password
    // against each candidate; the one whose hash verifies wins. Most-recent
    // first so a fresh signup wins ties when a user happens to share email
    // across tenants.
    const candidates = await this.prisma.bypass(async (tx) =>
      tx.user.findMany({
        where: { email, status: { not: 'SUSPENDED' } },
        orderBy: { createdAt: 'desc' },
      }),
    );

    let user: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.passwordHash, password)) {
        user = candidate;
        break;
      }
    }

    if (!user) {
      // Log failure against the most recent candidate (if any) so the tenant
      // owner sees the attempt. Unknown emails don't get attributed.
      const target = candidates[0];
      if (target) {
        await this.prisma.bypass(async (tx) =>
          tx.accessLog.create({
            data: {
              tenantId: target.tenantId,
              userId: target.id,
              email,
              action: 'login',
              success: false,
              ip: ctx.ip,
              userAgent: ctx.userAgent,
            },
          }),
        );
      }
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const { token, hash } = generateSessionToken();
    const expiresAt = sessionExpiry(constants.SESSION_TTL_MINUTES.tenant);

    await this.prisma.bypass(async (tx) => {
      await tx.userSession.create({
        data: {
          token: hash,
          userId: user.id,
          tenantId: user.tenantId,
          expiresAt,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await tx.accessLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          email,
          action: 'login',
          success: true,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
    });

    return { token, expiresAt, user };
  }

  async logout(rawToken: string, ctx: { ip?: string }) {
    const { hashSessionToken } = await import('../../common/auth/session.util.js');
    const hash = hashSessionToken(rawToken);
    await this.prisma.bypass(async (tx) => {
      const session = await tx.userSession.findUnique({ where: { token: hash } });
      if (session) {
        await tx.userSession.delete({ where: { token: hash } });
        await tx.accessLog.create({
          data: {
            tenantId: session.tenantId,
            userId: session.userId,
            email: '',
            action: 'logout',
            ip: ctx.ip,
          },
        });
      }
    });
  }

  async signup(input: SignupInput, ctx: { ip?: string; userAgent?: string }): Promise<SignupResult> {
    const data = signupSchema.parse(input);

    // Check slug + email uniqueness before any write
    const conflicts = await this.prisma.bypass(async (tx) =>
      Promise.all([
        tx.tenant.findUnique({ where: { slug: data.tenantSlug } }),
        tx.user.findFirst({ where: { email: data.email } }),
      ]),
    );

    if (conflicts[0]) throw new ConflictError('Ese identificador ya está en uso', { field: 'tenantSlug' });
    if (conflicts[1]) throw new ConflictError('Ya existe una cuenta con ese email', { field: 'email' });

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });

    const tenant = await this.prisma.bypass(async (tx) =>
      tx.tenant.create({
        data: {
          name: data.tenantName,
          slug: data.tenantSlug,
          contactEmail: data.email,
          users: {
            create: {
              email: data.email,
              name: data.name,
              passwordHash,
              role: 'OWNER',
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
            },
          },
        },
        include: { users: true },
      }),
    );

    const owner = tenant.users[0];
    if (!owner) throw new Error('Failed to create owner');
    const { token, hash } = generateSessionToken();
    const expiresAt = sessionExpiry(constants.SESSION_TTL_MINUTES.tenant);

    await this.prisma.bypass(async (tx) => {
      await tx.userSession.create({
        data: {
          token: hash,
          userId: owner.id,
          tenantId: tenant.id,
          expiresAt,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
      await tx.accessLog.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          email: owner.email,
          action: 'signup',
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
    });

    const { users: _users, ...tenantWithoutUsers } = tenant;
    return { token, expiresAt, tenant: tenantWithoutUsers, user: owner };
  }

  async findUserForMe(userId: string) {
    return this.prisma.bypass((tx) =>
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, mustChangePassword: true },
      }),
    );
  }

  async changePassword(
    input: ChangePasswordInput,
    ctx: { userId: string; tenantId: string; email: string; ip?: string },
  ): Promise<void> {
    const { currentPassword, newPassword } = changePasswordSchema.parse(input);

    if (currentPassword === newPassword) {
      throw new BadRequestError('La nueva contraseña debe ser distinta');
    }

    const user = await this.prisma.bypass((tx) =>
      tx.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
    );
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedError('Contraseña actual incorrecta');
    }

    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.bypass(async (tx) => {
      await tx.user.update({
        where: { id: ctx.userId },
        data: { passwordHash: hash, mustChangePassword: false },
      });
      // Invalidate all other sessions of this user (force re-login from other devices)
      await tx.userSession.deleteMany({ where: { userId: ctx.userId } });
      await tx.accessLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          email: ctx.email,
          action: 'change_password',
          ip: ctx.ip,
        },
      });
    });
  }
}
