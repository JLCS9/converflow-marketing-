import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

export interface ConsentEvidence {
  /** Cuándo se recogió (ISO). */
  at: string;
  /** Dónde: 'webchat' | 'form:landing-x' | 'import:brevo'… */
  where: string;
  /** Texto EXACTO que vio la persona al consentir. */
  textShown: string;
  ip?: string;
}

/**
 * Consentimiento por perfil, canal y finalidad, con evidencia (RGPD).
 * Append-only: otorgar de nuevo crea fila; revocar marca revokedAt en la
 * vigente. Los follow-ups y campañas DEBEN pasar por hasConsent().
 */
@Injectable()
export class ConsentsService {
  constructor(private readonly prisma: PrismaService) {}

  async grant(
    tenantId: string,
    profileId: string,
    channel: string,
    purpose: string,
    evidence: ConsentEvidence,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.consent.findFirst({
        where: { profileId, channel, purpose, revokedAt: null },
      });
      if (current?.granted) return current; // ya otorgado y vigente
      if (current) await tx.consent.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
      return tx.consent.create({
        data: { tenantId, profileId, channel, purpose, granted: true, evidence: evidence as never },
      });
    });
  }

  async revoke(
    tenantId: string,
    profileId: string,
    channel: string,
    purpose: string,
    evidence: ConsentEvidence,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.consent.findFirst({
        where: { profileId, channel, purpose, revokedAt: null },
      });
      if (current) await tx.consent.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
      // La revocación también deja evidencia propia.
      return tx.consent.create({
        data: { tenantId, profileId, channel, purpose, granted: false, evidence: evidence as never },
      });
    });
  }

  /** ¿Hay consentimiento VIGENTE y positivo para este canal+finalidad? */
  async hasConsent(tenantId: string, profileId: string, channel: string, purpose: string) {
    const current = await this.prisma.withTenant(tenantId, (tx) =>
      tx.consent.findFirst({
        where: { profileId, channel, purpose, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { granted: true },
      }),
    );
    return current?.granted === true;
  }
}
