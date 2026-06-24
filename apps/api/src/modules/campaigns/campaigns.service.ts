import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  NotFoundError,
  AppError,
  createCampaignSchema,
  updateCampaignSchema,
  audienceSchema,
  type CreateCampaignInput,
  type UpdateCampaignInput,
  type AudienceInput,
} from '@converflow/shared';
import { type PrismaClient } from '@converflow/db';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { BotRunnerService } from '../bots/bot-runner.service.js';
import { sanitizeEmailHtml, htmlToText } from '../../common/utils/email-html.js';
import { env } from '../../config/env.js';

// Prisma transaction client type, matching withTenant's callback param.
type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Per-channel pacing between sends (ms). WhatsApp is deliberately slow — Baileys
// is an unofficial client and bulk sending risks a ban (see ADR #7 / Cloud API).
const SEND_DELAY_MS: Record<string, number> = { EMAIL: 600, WHATSAPP: 4000 };

interface Contact {
  leadId?: string;
  clientId?: string;
  name: string | null;
  address: string;
}

@Injectable()
export class CampaignsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignsService.name);
  private timer: NodeJS.Timeout | null = null;
  private tickRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly botRunner: BotRunnerService,
  ) {}

  // ---- Scheduler (single cfai-api instance in prod) -----------------------
  onModuleInit() {
    // Launch due SCHEDULED campaigns once a minute. Cross-tenant scan via bypass.
    this.timer = setInterval(() => void this.tick(), 60_000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.tickRunning) return;
    this.tickRunning = true;
    try {
      const now = new Date();
      const due = await this.prisma.bypass((tx) =>
        tx.campaign.findMany({
          where: { status: 'SCHEDULED', scheduledAt: { not: null, lte: now } },
          select: { id: true, tenantId: true },
          take: 20,
        }),
      );
      for (const c of due) {
        // Atomically claim it so overlapping ticks don't double-send.
        const claimed = await this.prisma.bypass((tx) =>
          tx.campaign.updateMany({
            where: { id: c.id, status: 'SCHEDULED' },
            data: { status: 'SENDING', startedAt: now },
          }),
        );
        if (claimed.count === 1) void this.runSend(c.tenantId, c.id);
      }
    } catch (err) {
      this.logger.warn({ err }, 'campaign scheduler tick failed');
    } finally {
      this.tickRunning = false;
    }
  }

  // ---- CRUD ---------------------------------------------------------------
  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          channel: true,
          status: true,
          scheduledAt: true,
          totalRecipients: true,
          sentCount: true,
          failedCount: true,
          createdAt: true,
          completedAt: true,
        },
      }),
    );
  }

  async get(tenantId: string, id: string) {
    const campaign = await this.prisma.withTenant(tenantId, (tx) =>
      tx.campaign.findUnique({
        where: { id },
        include: {
          recipients: {
            orderBy: { createdAt: 'asc' },
            take: 500,
            select: {
              id: true,
              name: true,
              address: true,
              status: true,
              error: true,
              sentAt: true,
              openedAt: true,
              openCount: true,
            },
          },
        },
      }),
    );
    if (!campaign) throw new NotFoundError('Campaña no encontrada');
    return campaign;
  }

  async create(tenantId: string, userId: string | undefined, input: CreateCampaignInput) {
    const data = createCampaignSchema.parse(input);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.campaign.create({
        data: {
          tenantId,
          name: data.name,
          channel: data.channel,
          botId: data.botId,
          agentId: data.agentId,
          subject: data.subject,
          body: sanitizeEmailHtml(data.body),
          audience: (data.audience ?? {}) as never,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          createdByUserId: userId,
          status: 'DRAFT',
        },
        select: { id: true },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateCampaignInput) {
    const data = updateCampaignSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.campaign.findUnique({ where: { id }, select: { status: true } });
      if (!existing) throw new NotFoundError('Campaña no encontrada');
      if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
        throw new AppError('CONFLICT', 'Solo se pueden editar campañas en borrador o programadas', 409);
      }
      return tx.campaign.update({
        where: { id },
        data: {
          name: data.name,
          channel: data.channel,
          botId: data.botId === undefined ? undefined : data.botId,
          agentId: data.agentId === undefined ? undefined : data.agentId,
          subject: data.subject === undefined ? undefined : data.subject,
          body: data.body === undefined ? undefined : sanitizeEmailHtml(data.body),
          audience: data.audience === undefined ? undefined : (data.audience as never),
          scheduledAt:
            data.scheduledAt === undefined
              ? undefined
              : data.scheduledAt
                ? new Date(data.scheduledAt)
                : null,
        },
        select: { id: true },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const c = await tx.campaign.findUnique({ where: { id }, select: { status: true } });
      if (!c) throw new NotFoundError('Campaña no encontrada');
      if (c.status === 'SENDING') {
        throw new AppError('CONFLICT', 'No se puede borrar una campaña en envío', 409);
      }
      await tx.campaign.delete({ where: { id } });
    });
  }

  async cancel(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const c = await tx.campaign.findUnique({ where: { id }, select: { status: true } });
      if (!c) throw new NotFoundError('Campaña no encontrada');
      if (c.status !== 'SCHEDULED' && c.status !== 'SENDING') {
        throw new AppError('CONFLICT', 'Solo se pueden cancelar campañas programadas o en envío', 409);
      }
      return tx.campaign.update({
        where: { id },
        data: { status: 'CANCELLED' },
        select: { id: true, status: true },
      });
    });
  }

  // ---- Audience preview (no persistence) ----------------------------------
  async previewAudience(tenantId: string, channel: string, audienceInput: unknown) {
    const audience = audienceSchema.parse(audienceInput ?? {});
    const contacts = await this.prisma.withTenant(tenantId, (tx) =>
      this.resolveAudience(tx, channel, audience),
    );
    const deduped = this.dedupe(contacts);
    const suppressed = await this.suppressedSet(
      tenantId,
      channel,
      deduped.map((c) => c.address),
    );
    const sendable = deduped.filter((c) => !suppressed.has(c.address.toLowerCase()));
    const CAP = 1000;
    return {
      total: sendable.length,
      suppressed: deduped.length - sendable.length,
      truncated: sendable.length > CAP,
      contacts: sendable.slice(0, CAP).map((c) => ({
        leadId: c.leadId ?? null,
        clientId: c.clientId ?? null,
        name: c.name,
        address: c.address,
      })),
    };
  }

  // ---- Launch -------------------------------------------------------------
  async launch(tenantId: string, id: string) {
    const campaign = await this.prisma.withTenant(tenantId, (tx) =>
      tx.campaign.findUnique({ where: { id } }),
    );
    if (!campaign) throw new NotFoundError('Campaña no encontrada');
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      throw new AppError('CONFLICT', 'La campaña ya se ha lanzado', 409);
    }
    if (campaign.channel === 'EMAIL') {
      if (!campaign.subject?.trim()) {
        throw new AppError('BAD_REQUEST', 'Falta el asunto del email', 400);
      }
      // Campaigns send ONLY through the tenant's own mailbox — never Resend.
      const conn = await this.resolveEmailConn(tenantId, campaign.botId);
      if (!conn) {
        throw new AppError(
          'BAD_REQUEST',
          'Selecciona un bot de email con buzón conectado antes de enviar. Las campañas se envían desde tu propio correo (no usamos Resend).',
          400,
        );
      }
    }

    // Future schedule → just mark SCHEDULED; the scheduler fires it later.
    if (campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()) {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.campaign.update({ where: { id }, data: { status: 'SCHEDULED' } }),
      );
      return { status: 'SCHEDULED' as const, scheduledAt: campaign.scheduledAt };
    }

    // Send now.
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.campaign.update({ where: { id }, data: { status: 'SENDING', startedAt: new Date() } }),
    );
    void this.runSend(tenantId, id);
    return { status: 'SENDING' as const };
  }

  /**
   * Build recipients from the audience snapshot, then send sequentially with
   * per-channel pacing. Runs detached (fire-and-forget) — never awaited by a
   * request. All sends happen OUTSIDE transactions (slow network I/O).
   */
  private async runSend(tenantId: string, id: string) {
    try {
      const campaign = await this.prisma.withTenant(tenantId, (tx) =>
        tx.campaign.findUnique({ where: { id } }),
      );
      if (!campaign || campaign.status !== 'SENDING') return;

      const audience = audienceSchema.parse((campaign.audience as object) ?? {});
      const contacts = await this.prisma.withTenant(tenantId, (tx) =>
        this.resolveAudience(tx, campaign.channel, audience),
      );
      const deduped = this.dedupe(contacts);
      const suppressed = await this.suppressedSet(
        tenantId,
        campaign.channel,
        deduped.map((c) => c.address),
      );
      const sendable = deduped.filter((c) => !suppressed.has(c.address.toLowerCase()));

      // Persist recipients (idempotent via the unique [campaignId,address]).
      await this.prisma.withTenant(tenantId, async (tx) => {
        if (sendable.length) {
          await tx.campaignRecipient.createMany({
            data: sendable.map((c) => ({
              tenantId,
              campaignId: id,
              leadId: c.leadId,
              clientId: c.clientId,
              name: c.name,
              address: c.address,
              status: 'PENDING' as const,
            })),
            skipDuplicates: true,
          });
        }
        await tx.campaign.update({ where: { id }, data: { totalRecipients: sendable.length } });
      });

      const pending = await this.prisma.withTenant(tenantId, (tx) =>
        tx.campaignRecipient.findMany({ where: { campaignId: id, status: 'PENDING' } }),
      );

      // EMAIL: resolve the tenant's connected mailbox up front. No Resend fallback
      // for campaigns — if there's no connected mailbox we fail the whole campaign.
      const emailConn =
        campaign.channel === 'EMAIL'
          ? await this.resolveEmailConn(tenantId, campaign.botId)
          : null;
      if (campaign.channel === 'EMAIL' && !emailConn) {
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.campaign.update({ where: { id }, data: { status: 'FAILED' } }),
        );
        this.logger.warn(`campaign ${id} aborted: no connected mailbox (no Resend fallback)`);
        return;
      }

      const delay = SEND_DELAY_MS[campaign.channel] ?? 1000;
      let sent = 0;
      let failed = 0;
      for (const r of pending) {
        // Abort if the campaign was cancelled mid-run.
        const fresh = await this.prisma.withTenant(tenantId, (tx) =>
          tx.campaign.findUnique({ where: { id }, select: { status: true } }),
        );
        if (fresh?.status === 'CANCELLED') break;

        // campaign.body is sanitized HTML with {variables}; render fills them in.
        const renderedBody = this.render(campaign.body, r);
        try {
          let messageId: string | undefined;
          if (campaign.channel === 'EMAIL') {
            const text = htmlToText(renderedBody) + this.unsubscribeFooter(tenantId, r.address);
            const html = this.buildHtml(tenantId, r.id, renderedBody, r.address);
            // SMTP only (tenant's own mailbox) — never Resend for campaigns.
            const res = await this.email.sendSmtp(emailConn!, {
              to: r.address,
              subject: campaign.subject ?? 'Información',
              text,
              html,
            });
            messageId = res.id;
          } else if (campaign.channel === 'WHATSAPP') {
            if (!campaign.botId) throw new Error('La campaña no tiene bot de WhatsApp');
            // WhatsApp is plain text — flatten the HTML body.
            const res = await this.botRunner.sendText(
              campaign.botId,
              r.address,
              htmlToText(renderedBody),
            );
            messageId = res.id;
          }
          await this.prisma.withTenant(tenantId, (tx) =>
            tx.campaignRecipient.update({
              where: { id: r.id },
              data: { status: 'SENT', messageId, sentAt: new Date() },
            }),
          );
          sent += 1;
        } catch (err) {
          await this.prisma.withTenant(tenantId, (tx) =>
            tx.campaignRecipient.update({
              where: { id: r.id },
              data: { status: 'FAILED', error: String((err as Error)?.message ?? err).slice(0, 300) },
            }),
          );
          failed += 1;
        }
        await sleep(delay);
      }

      await this.prisma.withTenant(tenantId, (tx) =>
        tx.campaign.update({
          where: { id },
          data: { status: 'SENT', sentCount: sent, failedCount: failed, completedAt: new Date() },
        }),
      );
      this.logger.log(`campaign ${id} done: ${sent} sent, ${failed} failed`);
    } catch (err) {
      this.logger.error({ err, id }, 'campaign send crashed');
      await this.prisma
        .withTenant(tenantId, (tx) =>
          tx.campaign.update({ where: { id }, data: { status: 'FAILED' } }),
        )
        .catch(() => undefined);
    }
  }

  // ---- Audience resolution ------------------------------------------------
  private async resolveAudience(
    tx: PrismaTx,
    channel: string,
    a: AudienceInput,
  ): Promise<Contact[]> {
    const out: Contact[] = [];
    const wantLeads = a.entity === 'LEAD' || a.entity === 'BOTH';
    const wantClients = a.entity === 'CLIENT' || a.entity === 'BOTH';
    const addressField = channel === 'WHATSAPP' ? 'phone' : 'email';

    if (wantLeads) {
      const leads = await tx.lead.findMany({
        where: {
          [addressField]: { not: null },
          ...(a.statuses?.length ? { status: { in: a.statuses as never } } : {}),
          ...(a.sources?.length ? { source: { in: a.sources } } : {}),
          ...(a.ownerId ? { ownerId: a.ownerId } : {}),
          ...(a.excludeLeadIds?.length ? { id: { notIn: a.excludeLeadIds } } : {}),
        },
        select: { id: true, name: true, email: true, phone: true },
      });
      for (const l of leads) {
        const address = (channel === 'WHATSAPP' ? l.phone : l.email)?.trim();
        if (address) out.push({ leadId: l.id, name: l.name, address });
      }
    }

    if (wantClients) {
      const clients = await tx.client.findMany({
        where: {
          [addressField]: { not: null },
          ...(a.statuses?.length ? { status: { in: a.statuses as never } } : {}),
          ...(a.sources?.length ? { source: { in: a.sources } } : {}),
          ...(a.ownerId ? { ownerId: a.ownerId } : {}),
          ...(a.excludeClientIds?.length ? { id: { notIn: a.excludeClientIds } } : {}),
        },
        select: { id: true, name: true, email: true, phone: true },
      });
      for (const c of clients) {
        const address = (channel === 'WHATSAPP' ? c.phone : c.email)?.trim();
        if (address) out.push({ clientId: c.id, name: c.name, address });
      }
    }

    // Manual includes — specific contacts even if outside the filter.
    if (a.includeLeadIds?.length) {
      const extra = await tx.lead.findMany({
        where: { id: { in: a.includeLeadIds } },
        select: { id: true, name: true, email: true, phone: true },
      });
      for (const l of extra) {
        const address = (channel === 'WHATSAPP' ? l.phone : l.email)?.trim();
        if (address) out.push({ leadId: l.id, name: l.name, address });
      }
    }
    if (a.includeClientIds?.length) {
      const extra = await tx.client.findMany({
        where: { id: { in: a.includeClientIds } },
        select: { id: true, name: true, email: true, phone: true },
      });
      for (const c of extra) {
        const address = (channel === 'WHATSAPP' ? c.phone : c.email)?.trim();
        if (address) out.push({ clientId: c.id, name: c.name, address });
      }
    }

    return out;
  }

  /** The tenant's CONNECTED mailbox for a bot, or null. No Resend fallback. */
  private resolveEmailConn(tenantId: string, botId: string | null) {
    if (!botId) return Promise.resolve(null);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailConnection.findFirst({ where: { botId, status: 'CONNECTED' } }),
    );
  }

  private dedupe(contacts: Contact[]): Contact[] {
    const seen = new Set<string>();
    const out: Contact[] = [];
    for (const c of contacts) {
      const key = c.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  private async suppressedSet(tenantId: string, channel: string, addresses: string[]) {
    if (!addresses.length) return new Set<string>();
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.suppression.findMany({
        where: { channel: channel as never, address: { in: addresses } },
        select: { address: true },
      }),
    );
    return new Set(rows.map((r) => r.address.toLowerCase()));
  }

  private render(template: string, r: { name: string | null; address: string }): string {
    const first = (r.name ?? '').trim().split(/\s+/)[0] ?? '';
    return template
      .replace(/\{nombre\}/gi, r.name ?? '')
      .replace(/\{first_?name\}/gi, first)
      .replace(/\{email\}/gi, r.address)
      .replace(/\{telefono\}/gi, r.address);
  }

  // ---- Unsubscribe (signed token, public endpoint) ------------------------
  private tokenFor(tenantId: string, channel: string, address: string): string {
    const payload = Buffer.from(`${tenantId}:${channel}:${address}`).toString('base64url');
    const sig = createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  private unsubscribeFooter(tenantId: string, address: string): string {
    const url = `${env.API_PUBLIC_URL.replace(/\/$/, '')}/unsubscribe?token=${this.tokenFor(
      tenantId,
      'EMAIL',
      address,
    )}`;
    return `\n\n—\nSi no deseas recibir más comunicaciones, date de baja aquí: ${url}`;
  }

  // ---- HTML body + open tracking ------------------------------------------
  private buildHtml(tenantId: string, recipientId: string, bodyHtml: string, address: string): string {
    const base = env.API_PUBLIC_URL.replace(/\/$/, '');
    // bodyHtml is already sanitized HTML (templates/editor) with variables filled.
    const unsubUrl = `${base}/unsubscribe?token=${this.tokenFor(tenantId, 'EMAIL', address)}`;
    const pixel = `${base}/c/o/${this.trackToken(recipientId)}`;
    return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">
<div>${bodyHtml}</div>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="font-size:12px;color:#888">Si no deseas recibir más comunicaciones, <a href="${unsubUrl}" style="color:#888">date de baja aquí</a>.</p>
<img src="${pixel}" width="1" height="1" alt="" style="display:none">
</body></html>`;
  }

  private trackToken(recipientId: string): string {
    const payload = Buffer.from(recipientId).toString('base64url');
    const sig = createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  /** Record an email open from the tracking pixel. Tenant-agnostic (bypass). */
  async trackOpen(token: string): Promise<void> {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return;
    const expected = createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return;
    const recipientId = Buffer.from(payload, 'base64url').toString('utf8');
    await this.prisma
      .bypass(async (tx) => {
        // openedAt = first open only; openCount bumps on every open.
        await tx.campaignRecipient.updateMany({
          where: { id: recipientId, openedAt: null },
          data: { openedAt: new Date() },
        });
        await tx.campaignRecipient.updateMany({
          where: { id: recipientId },
          data: { openCount: { increment: 1 } },
        });
      })
      .catch(() => undefined);
  }

  /** Verify a token and add the address to the suppression list. Returns the address. */
  async unsubscribeByToken(token: string): Promise<{ address: string }> {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) throw new AppError('BAD_REQUEST', 'Enlace inválido', 400);
    const expected = createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppError('BAD_REQUEST', 'Enlace inválido o caducado', 400);
    }
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const [tenantId, channel, address] = decoded.split(':');
    if (!tenantId || !channel || !address) throw new AppError('BAD_REQUEST', 'Enlace inválido', 400);

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.suppression.upsert({
        where: { tenantId_channel_address: { tenantId, channel: channel as never, address } },
        create: { tenantId, channel: channel as never, address, reason: 'UNSUBSCRIBE' },
        update: {},
      }),
    );
    return { address };
  }
}
