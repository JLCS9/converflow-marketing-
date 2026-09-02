import { Injectable } from '@nestjs/common';
import type { IdentityKind } from '@converflow/db';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** Normalización mínima de identidades. La resolución completa llega en F1. */
export function normalizeIdentity(kind: IdentityKind, value: string): string {
  const v = value.trim();
  if (kind === 'EMAIL') return v.toLowerCase();
  if (kind === 'PHONE') return v.replace(/[\s\-().]/g, '');
  return v;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matching determinista: si la identidad existe, devuelve su perfil; si no,
   * crea perfil + identidad. El email manda sobre el teléfono (F1 añade el
   * merge y la agregación por dominio corporativo).
   */
  async findOrCreateByIdentity(
    tenantId: string,
    kind: IdentityKind,
    rawValue: string,
    seed: { name?: string; source?: string } = {},
  ) {
    const value = normalizeIdentity(kind, rawValue);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.profileIdentity.findUnique({
        where: { tenantId_kind_value: { tenantId, kind, value } },
        include: { profile: true },
      });
      if (existing) return existing.profile;
      return tx.profile.create({
        data: {
          tenantId,
          name: seed.name,
          identities: {
            create: { tenantId, kind, value, source: seed.source },
          },
        },
      });
    });
  }
}
