import { Injectable, Logger } from '@nestjs/common';
import { BadRequestError, NotFoundError, effectivePermissions } from '@converflow/shared';
import type { UserRole } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { canAccessConnection } from '../mail/mail-connections.service.js';

export interface RoutingRuleInput {
  id?: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'WEBCHAT';
  endpointId?: string | null;
  name: string;
  order?: number;
  enabled?: boolean;
  keywords?: string[];
  fromDomain?: string | null;
  assignUserId: string;
}

export interface RoutingMatchInput {
  channel: string;
  endpointId: string;
  subject?: string | null;
  text: string;
  fromAddress?: string | null;
}

/**
 * Atención autónoma · Enrutado GENÉRICO a personas. Una sola tabla de reglas
 * para todos los canales (presentes y futuros): el canal aporta su endpoint
 * (buzón, bot…) y su acción de asignar; este servicio solo decide QUIÉN.
 * Matching: reglas habilitadas del canal (endpoint concreto o «todas»),
 * ordenadas; la PRIMERA que casa gana (patrón del enrutado de Soporte).
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- CRUD -------------------------------------------------------------------

  list(tenantId: string, channel?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.routingRule.findMany({
        where: channel ? { channel: channel as never } : undefined,
        orderBy: [{ channel: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  }

  async upsert(tenantId: string, input: RoutingRuleInput) {
    const keywords = (input.keywords ?? []).map((k) => k.trim()).filter(Boolean);
    const fromDomain = input.fromDomain?.trim().replace(/^@/, '').toLowerCase() || null;
    if (!keywords.length && !fromDomain) {
      throw new BadRequestError('La regla necesita al menos una palabra clave o un dominio');
    }
    await this.validateAssignee(tenantId, input.channel, input.endpointId ?? null, input.assignUserId);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const data = {
        channel: input.channel as never,
        endpointId: input.endpointId ?? null,
        name: input.name.trim(),
        order: input.order ?? 0,
        enabled: input.enabled ?? true,
        keywords: keywords as never,
        fromDomain,
        assignUserId: input.assignUserId,
      };
      if (input.id) {
        const existing = await tx.routingRule.findUnique({ where: { id: input.id }, select: { id: true } });
        if (!existing) throw new NotFoundError('Regla no encontrada');
        return tx.routingRule.update({ where: { id: input.id }, data });
      }
      return tx.routingRule.create({ data: { tenantId, ...data } });
    });
  }

  remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.routingRule.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Regla no encontrada');
      await tx.routingRule.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ---- matching (puro: sin efectos — la asignación es del adaptador de canal) ----

  async match(tenantId: string, input: RoutingMatchInput): Promise<string | null> {
    const rules = await this.prisma.withTenant(tenantId, (tx) =>
      tx.routingRule.findMany({
        where: {
          enabled: true,
          channel: input.channel as never,
          OR: [{ endpointId: input.endpointId }, { endpointId: null }],
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
    );
    if (!rules.length) return null;

    const hay = `${input.subject ?? ''}\n${input.text}`.toLowerCase();
    const domain = input.fromAddress?.split('@')[1]?.toLowerCase() ?? null;

    for (const rule of rules) {
      if (rule.fromDomain && rule.fromDomain !== domain) continue;
      const keywords = Array.isArray(rule.keywords) ? (rule.keywords as string[]) : [];
      if (keywords.length && !keywords.some((k) => hay.includes(k.toLowerCase()))) continue;
      return rule.assignUserId;
    }
    return null;
  }

  // ---- validación (alta/edición) --------------------------------------------------

  /** El asignado debe estar ACTIVO, tener permiso de conversaciones y ACCESO
   *  al endpoint concreto (buzón con «Solo estas personas», privado…). */
  async validateAssignee(
    tenantId: string,
    channel: string,
    endpointId: string | null,
    assignUserId: string,
  ): Promise<void> {
    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({
        where: { id: assignUserId, status: 'ACTIVE' },
        select: { id: true, role: true, permissions: true },
      }),
    );
    if (!user) throw new BadRequestError('El usuario asignado no existe o no está activo');

    const perms = effectivePermissions(
      user.role as UserRole,
      Array.isArray(user.permissions) ? (user.permissions as string[]) : null,
    );
    if (!perms.includes('conversations')) {
      throw new BadRequestError('El usuario asignado no tiene permiso de conversaciones');
    }

    if (channel === 'EMAIL' && endpointId) {
      const conn = await this.prisma.withTenant(tenantId, (tx) =>
        tx.mailConnection.findUnique({
          where: { id: endpointId },
          select: { visibility: true, ownerUserId: true, memberUserIds: true },
        }),
      );
      if (!conn) throw new NotFoundError('Bandeja no encontrada');
      if (!canAccessConnection(conn, { userId: user.id, role: user.role })) {
        throw new BadRequestError('El usuario asignado no tiene acceso a esa bandeja');
      }
    }
  }
}
