import { Injectable, Logger } from '@nestjs/common';
import { AppError, BadRequestError } from '@converflow/shared';
import { env } from '../../config/env.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInSec: number;
  scope?: string;
}

export interface BusyInterval {
  start: string;
  end: string;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  attendeeEmails?: string[];
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  isConfigured(): boolean {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }

  get redirectUri(): string {
    return (
      env.GOOGLE_OAUTH_REDIRECT_URI ?? `${env.API_PUBLIC_URL}/integrations/google/callback`
    );
  }

  private clientId(): string {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new AppError('INTERNAL', 'Google Calendar no está configurado (falta GOOGLE_CLIENT_ID)', 503);
    }
    return env.GOOGLE_CLIENT_ID;
  }

  private clientSecret(): string {
    if (!env.GOOGLE_CLIENT_SECRET) {
      throw new AppError('INTERNAL', 'Google Calendar no está configurado (falta GOOGLE_CLIENT_SECRET)', 503);
    }
    return env.GOOGLE_CLIENT_SECRET;
  }

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });
    const data = await this.tokenRequest(body);
    if (!data.refresh_token) {
      // Google only returns refresh_token on first consent or with prompt=consent.
      throw new BadRequestError(
        'Google no devolvió refresh token. Revoca el acceso en tu cuenta de Google y vuelve a conectar.',
      );
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresInSec: data.expires_in,
      scope: data.scope,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      grant_type: 'refresh_token',
    });
    const data = await this.tokenRequest(body);
    return {
      accessToken: data.access_token,
      expiresInSec: data.expires_in,
      scope: data.scope,
    };
  }

  async getUserEmail(accessToken: string): Promise<string> {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new AppError('INTERNAL', 'No se pudo leer el perfil de Google', 502);
    }
    const data = (await res.json()) as { email?: string };
    if (!data.email) throw new AppError('INTERNAL', 'Google no devolvió el email', 502);
    return data.email;
  }

  async freeBusy(
    accessToken: string,
    opts: { timeMinIso: string; timeMaxIso: string; calendarId: string },
  ): Promise<BusyInterval[]> {
    const res = await fetch(`${CALENDAR_BASE}/freeBusy`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: opts.timeMinIso,
        timeMax: opts.timeMaxIso,
        items: [{ id: opts.calendarId }],
      }),
    });
    if (!res.ok) {
      throw new AppError('INTERNAL', `Google freeBusy falló (${res.status})`, 502);
    }
    const data = (await res.json()) as {
      calendars?: Record<string, { busy?: BusyInterval[] }>;
    };
    return data.calendars?.[opts.calendarId]?.busy ?? [];
  }

  async insertEvent(
    accessToken: string,
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<{ id: string; htmlLink: string }> {
    const res = await fetch(
      `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          summary: event.summary,
          description: event.description,
          start: { dateTime: event.startIso, timeZone: event.timeZone },
          end: { dateTime: event.endIso, timeZone: event.timeZone },
          attendees: event.attendeeEmails?.map((email) => ({ email })),
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`Google events.insert failed (${res.status}): ${text}`);
      throw new AppError('INTERNAL', `No se pudo crear el evento en Google (${res.status})`, 502);
    }
    const data = (await res.json()) as { id: string; htmlLink: string };
    return { id: data.id, htmlLink: data.htmlLink };
  }

  private async tokenRequest(body: URLSearchParams): Promise<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  }> {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`Google token request failed (${res.status}): ${text}`);
      throw new AppError('INTERNAL', `Intercambio de token con Google falló (${res.status})`, 502);
    }
    return res.json() as Promise<{
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      scope?: string;
    }>;
  }
}
