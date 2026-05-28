import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError, BadRequestError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { GoogleCalendarService } from '../../common/google/google-calendar.service.js';
import { encryptSecret, decryptSecret } from '../../common/utils/crypto.js';
import { env } from '../../config/env.js';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_TOKEN_SKEW_MS = 60 * 1000; // refresh 60s before expiry

interface StatePayload {
  u: string; // userId
  t: string; // tenantId
  exp: number;
  n: string; // nonce
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarService,
  ) {}

  // --- OAuth state (signed, cookie-independent so the callback is robust) ----

  private signState(userId: string, tenantId: string): string {
    const payload: StatePayload = {
      u: userId,
      t: tenantId,
      exp: Date.now() + STATE_TTL_MS,
      n: randomBytes(8).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', env.AUTH_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  private verifyState(state: string): StatePayload {
    const [encoded, sig] = state.split('.');
    if (!encoded || !sig) throw new BadRequestError('State inválido');
    const expected = createHmac('sha256', env.AUTH_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestError('State con firma inválida');
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StatePayload;
    if (Date.now() > payload.exp) throw new BadRequestError('State caducado, reintenta');
    return payload;
  }

  // --- Connect / callback ----------------------------------------------------

  getAuthUrl(userId: string, tenantId: string): string {
    if (!this.google.isConfigured()) {
      throw new AppError('INTERNAL', 'Google Calendar no está configurado en el servidor', 503);
    }
    return this.google.buildAuthUrl(this.signState(userId, tenantId));
  }

  /** Returns the web URL to redirect the browser back to after the callback. */
  async handleCallback(code: string, state: string): Promise<string> {
    const settingsUrl = `${env.WEB_PUBLIC_URL}/app/settings`;
    let payload: StatePayload;
    try {
      payload = this.verifyState(state);
    } catch {
      return `${settingsUrl}?google=error`;
    }

    try {
      const tokens = await this.google.exchangeCode(code);
      const googleEmail = await this.google.getUserEmail(tokens.accessToken);
      const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000);

      await this.prisma.withTenant(payload.t, (tx) =>
        tx.calendarConnection.upsert({
          where: { userId: payload.u },
          create: {
            tenantId: payload.t,
            userId: payload.u,
            provider: 'google',
            googleEmail,
            refreshTokenEnc: encryptSecret(tokens.refreshToken!),
            accessTokenEnc: encryptSecret(tokens.accessToken),
            accessTokenExpiresAt: expiresAt,
            scope: tokens.scope,
          },
          update: {
            googleEmail,
            refreshTokenEnc: encryptSecret(tokens.refreshToken!),
            accessTokenEnc: encryptSecret(tokens.accessToken),
            accessTokenExpiresAt: expiresAt,
            scope: tokens.scope,
          },
        }),
      );
      return `${settingsUrl}?google=connected`;
    } catch {
      return `${settingsUrl}?google=error`;
    }
  }

  // --- Status / disconnect ---------------------------------------------------

  async getStatus(tenantId: string, userId: string) {
    const connection = await this.prisma.withTenant(tenantId, (tx) =>
      tx.calendarConnection.findUnique({ where: { userId } }),
    );
    return {
      configured: this.google.isConfigured(),
      connected: !!connection,
      googleEmail: connection?.googleEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  }

  async disconnect(tenantId: string, userId: string) {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.calendarConnection.deleteMany({ where: { userId } }),
    );
    return { ok: true };
  }

  // --- Token lifecycle (used by MeetingsService) -----------------------------

  /** Returns a valid access token + the connection's calendar id, refreshing if needed. */
  async getValidAccess(
    tenantId: string,
    userId: string,
  ): Promise<{ accessToken: string; calendarId: string }> {
    const connection = await this.prisma.withTenant(tenantId, (tx) =>
      tx.calendarConnection.findUnique({ where: { userId } }),
    );
    if (!connection) {
      throw new NotFoundError('No has conectado tu Google Calendar');
    }

    const stillValid =
      connection.accessTokenEnc &&
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() - ACCESS_TOKEN_SKEW_MS > Date.now();

    if (stillValid) {
      return {
        accessToken: decryptSecret(connection.accessTokenEnc!),
        calendarId: connection.calendarId,
      };
    }

    // Refresh.
    const refreshToken = decryptSecret(connection.refreshTokenEnc);
    const refreshed = await this.google.refreshAccessToken(refreshToken);
    const expiresAt = new Date(Date.now() + refreshed.expiresInSec * 1000);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.calendarConnection.update({
        where: { userId },
        data: {
          accessTokenEnc: encryptSecret(refreshed.accessToken),
          accessTokenExpiresAt: expiresAt,
        },
      }),
    );
    return { accessToken: refreshed.accessToken, calendarId: connection.calendarId };
  }
}
