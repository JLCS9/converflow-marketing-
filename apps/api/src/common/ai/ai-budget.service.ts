import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '@converflow/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** How long a tenant's month-to-date total is trusted before re-reading it. */
const CACHE_TTL_MS = 60_000;

interface Entry {
  tokens: number;
  at: number;
  cap: number | null;
  autoInbound: boolean;
}

/**
 * Per-tenant spending guard for AI.
 *
 * Why this exists: nothing capped AI spend. Every inbound message triggered
 * either an agent loop (up to 4 model calls with growing context) or a
 * classification, unconditionally and with no off switch, so a busy inbox could
 * burn tokens indefinitely and the only way to notice was the provider's
 * billing page.
 *
 * Two levers, both owned by the tenant:
 *  - `aiInboundAnalysis`: turn off automatic analysis of incoming messages.
 *    On-demand features (summary, translate, assistant) keep working.
 *  - `aiMonthlyTokenCap`: a hard stop for the calendar month. Reaching it stops
 *    AI dead instead of quietly spending more.
 *
 * The month-to-date total is cached for a minute per tenant: it is an aggregate
 * over `ai_usage`, and an AI call is slow enough that a minute of staleness
 * costs nothing while re-reading on every call would not be free.
 */
@Injectable()
export class AiBudgetService {
  private readonly logger = new Logger(AiBudgetService.name);
  private readonly cache = new Map<string, Entry>();

  constructor(private readonly prisma: PrismaService) {}

  /** Start of the current calendar month, UTC. */
  private monthStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private async load(tenantId: string): Promise<Entry> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

    const [tenant, used] = await Promise.all([
      this.prisma.bypass((tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { aiMonthlyTokenCap: true, aiInboundAnalysis: true },
        }),
      ),
      this.prisma.withTenant(tenantId, (tx) =>
        tx.aiUsage.aggregate({
          where: { createdAt: { gte: this.monthStart() } },
          _sum: { totalTokens: true },
        }),
      ),
    ]);

    const entry: Entry = {
      tokens: used._sum.totalTokens ?? 0,
      at: Date.now(),
      cap: tenant?.aiMonthlyTokenCap ?? null,
      autoInbound: tenant?.aiInboundAnalysis ?? true,
    };
    this.cache.set(tenantId, entry);
    return entry;
  }

  /** Month-to-date usage plus the tenant's limits, for the settings screen. */
  async status(tenantId: string): Promise<{
    tokensThisMonth: number;
    cap: number | null;
    remaining: number | null;
    inboundAnalysis: boolean;
  }> {
    const e = await this.load(tenantId);
    return {
      tokensThisMonth: e.tokens,
      cap: e.cap,
      remaining: e.cap == null ? null : Math.max(0, e.cap - e.tokens),
      inboundAnalysis: e.autoInbound,
    };
  }

  /** Throws when the tenant has spent its monthly allowance. */
  async assertWithinBudget(tenantId: string): Promise<void> {
    const e = await this.load(tenantId);
    if (e.cap != null && e.tokens >= e.cap) {
      this.logger.warn({ tenantId, used: e.tokens, cap: e.cap }, 'AI monthly cap reached');
      throw new AppError(
        'CONFLICT',
        'Has alcanzado el límite mensual de IA configurado para tu cuenta. ' +
          'Puedes ampliarlo en Configuración → IA y automatización.',
        429,
      );
    }
  }

  /** Is automatic analysis of inbound messages enabled for this tenant? */
  async inboundAnalysisEnabled(tenantId: string): Promise<boolean> {
    return (await this.load(tenantId)).autoInbound;
  }

  /**
   * Add the tokens a call just spent, so the cap bites within the same minute
   * instead of waiting for the cache to expire. `ai_usage` is still the source
   * of truth on the next refresh.
   */
  addSpend(tenantId: string, tokens: number): void {
    const hit = this.cache.get(tenantId);
    if (hit) hit.tokens += tokens;
  }

  /** Drop the cache for a tenant whose settings just changed. */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
