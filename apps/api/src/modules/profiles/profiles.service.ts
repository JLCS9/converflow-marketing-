import { Injectable, Logger } from '@nestjs/common';
import type { IdentityKind } from '@converflow/db';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** Normalización mínima de identidades (email manda; teléfono E.164-ish). */
export function normalizeIdentity(kind: IdentityKind, value: string): string {
  const v = value.trim();
  if (kind === 'EMAIL') return v.toLowerCase();
  if (kind === 'PHONE') return v.replace(/[\s\-().]/g, '');
  return v;
}

/** Dominios de email personales: nunca disparan la alerta B2B. */
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'outlook.es', 'live.com',
  'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.es', 'aol.com', 'msn.com', 'telefonica.net', 'movistar.es',
]);

export function corporateDomainOf(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || FREEMAIL.has(domain)) return null;
  return domain;
}

export interface EventIdentity {
  email?: string;
  phone?: string;
  waId?: string;
}

/** Umbral de la alerta B2B: N perfiles del mismo dominio corporativo. */
const B2B_THRESHOLD = 3;

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matching determinista: la identidad primaria (email > teléfono > wa_id)
   * localiza o crea el perfil; las secundarias del mismo evento se ADJUNTAN
   * al perfil solo si nadie más las reclama (sin merges automáticos en F1 —
   * conservador a propósito).
   */
  async resolveForEvent(
    tenantId: string,
    identity: EventIdentity,
    seed: { name?: string; source?: string } = {},
  ) {
    const pairs: [IdentityKind, string][] = [];
    if (identity.email) pairs.push(['EMAIL', identity.email]);
    if (identity.phone) pairs.push(['PHONE', identity.phone]);
    if (identity.waId) pairs.push(['WA_ID', identity.waId]);
    if (pairs.length === 0) return null;

    const [primaryKind, primaryRaw] = pairs[0]!;
    const primary = normalizeIdentity(primaryKind, primaryRaw);

    const { profile, createdIdentity } = await this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.profileIdentity.findUnique({
        where: { tenantId_kind_value: { tenantId, kind: primaryKind, value: primary } },
        include: { profile: true },
      });
      if (existing) return { profile: existing.profile, createdIdentity: false };
      const created = await tx.profile.create({
        data: {
          tenantId,
          name: seed.name,
          identities: { create: { tenantId, kind: primaryKind, value: primary, source: seed.source } },
        },
      });
      return { profile: created, createdIdentity: true };
    });

    // Identidades secundarias: adjuntar si están libres.
    for (const [kind, raw] of pairs.slice(1)) {
      const value = normalizeIdentity(kind, raw);
      await this.prisma.withTenant(tenantId, async (tx) => {
        const claimed = await tx.profileIdentity.findUnique({
          where: { tenantId_kind_value: { tenantId, kind, value } },
          select: { profileId: true },
        });
        if (claimed) {
          if (claimed.profileId !== profile.id) {
            // Posible duplicado de persona: se registra, no se fusiona (F1).
            this.logger.warn(
              `identidad ${kind} compartida entre perfiles ${claimed.profileId} y ${profile.id} (tenant ${tenantId})`,
            );
          }
          return;
        }
        await tx.profileIdentity.create({
          data: { tenantId, profileId: profile.id, kind, value, source: seed.source },
        });
      });
    }

    // Agregación B2B: varios perfiles de la misma empresa → oportunidad.
    if (createdIdentity && primaryKind === 'EMAIL') {
      const domain = corporateDomainOf(primary);
      if (domain) await this.maybeRaiseB2bAlert(tenantId, domain);
    }

    return profile;
  }

  /** Compat: resolución simple por una identidad (usada por tests y F0). */
  async findOrCreateByIdentity(
    tenantId: string,
    kind: IdentityKind,
    rawValue: string,
    seed: { name?: string; source?: string } = {},
  ) {
    const identity: EventIdentity =
      kind === 'EMAIL' ? { email: rawValue } : kind === 'PHONE' ? { phone: rawValue } : { waId: rawValue };
    const profile = await this.resolveForEvent(tenantId, identity, seed);
    return profile!;
  }

  private async maybeRaiseB2bAlert(tenantId: string, domain: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const count = await tx.profileIdentity.count({
        where: { kind: 'EMAIL', value: { endsWith: `@${domain}` } },
      });
      if (count < B2B_THRESHOLD) return;
      // Dedupe: una alerta viva por dominio en 30 días.
      const recent = await tx.alert.findFirst({
        where: {
          type: 'B2B_DOMAIN',
          resourceId: domain,
          dismissedAt: null,
          createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
        select: { id: true },
      });
      if (recent) return;
      await tx.alert.create({
        data: {
          tenantId,
          type: 'B2B_DOMAIN',
          severity: 'INFO',
          title: `${count} contactos de ${domain}`,
          description:
            'Varias personas de la misma empresa han contactado. Puede ser una oportunidad B2B: revisa sus perfiles y considera un trato de cuenta.',
          resourceType: 'domain',
          resourceId: domain,
        },
      });
      this.logger.log(`alerta B2B: ${domain} (${count} perfiles) en tenant ${tenantId}`);
    });
  }
}
