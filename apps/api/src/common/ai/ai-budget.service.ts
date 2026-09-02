import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { AppError } from '@converflow/shared';
import { env } from '../../config/env.js';
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
export class AiBudgetService implements OnModuleDestroy {
  private readonly logger = new Logger(AiBudgetService.name);
  private readonly cache = new Map<string, Entry>();
  /**
   * F2 · Contador vivo del mes en Redis (`ai:spend:<tenant>:<YYYY-MM>`): con
   * varias réplicas de la API, la caché in-process de cada una hacía el cap
   * aproximado. Redis es best-effort — si no está, se degrada al comportamiento
   * anterior; `ai_usage` sigue siendo la fuente de verdad en cada refresco.
   */
  private redis: IORedis | null = null;

  constructor(private readonly prisma: PrismaService) {
    if (env.NODE_ENV === 'test') {
      // Los unit tests validan la lógica in-process; el contador Redis es
      // best-effort y en test apuntaría al Redis real del desarrollador.
      this.redis = null;
      return;
    }
    try {
      this.redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      this.redis.on('error', () => {}); // best-effort: sin spam en logs
    } catch {
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => {});
  }

  private spendKey(tenantId: string): string {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return `ai:spend:${tenantId}:${month}`;
  }

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

    let tokens = used._sum.totalTokens ?? 0;
    // El contador de Redis puede ir por delante del aggregate (escrituras de
    // otras réplicas aún no consultadas): gana el mayor.
    if (this.redis) {
      try {
        const key = this.spendKey(tenantId);
        const live = Number(await this.redis.get(key));
        if (Number.isFinite(live) && live > tokens) tokens = live;
        else {
          await this.redis.set(key, String(tokens), 'EX', 35 * 86_400);
        }
      } catch {
        /* Redis caído → seguimos con el aggregate */
      }
    }

    const entry: Entry = {
      tokens,
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
    if (this.redis) {
      const key = this.spendKey(tenantId);
      void this.redis
        .incrby(key, tokens)
        .then(() => this.redis?.expire(key, 35 * 86_400))
        .catch(() => {});
    }
  }

  /** Drop the cache for a tenant whose settings just changed. */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
