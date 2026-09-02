import { Injectable, Logger } from '@nestjs/common';
import { BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  evaluateInactivity,
  evaluateOnEvent,
  validateDefinition,
  type LifecycleDefinitionData,
} from './lifecycle.engine.js';

/**
 * Aplica la máquina de estados del tenant sobre los perfiles. El estado
 * vigente vive denormalizado en Profile.lifecycleState; cada transición deja
 * fila en lifecycle_states (append-only).
 */
@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getActiveDefinition(tenantId: string): Promise<LifecycleDefinitionData | null> {
    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lifecycleDefinition.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } }),
    );
    if (!row) return null;
    return { states: row.states as never, transitions: row.transitions as never };
  }

  async upsertDefinition(
    tenantId: string,
    name: string,
    def: LifecycleDefinitionData,
    template?: string,
  ) {
    const errors = validateDefinition(def);
    if (errors.length) throw new BadRequestError(`Definición inválida: ${errors.join(' · ')}`);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.lifecycleDefinition.upsert({
        where: { tenantId_name: { tenantId, name } },
        update: { states: def.states as never, transitions: def.transitions as never, template },
        create: {
          tenantId,
          name,
          states: def.states as never,
          transitions: def.transitions as never,
          template,
        },
      }),
    );
  }

  /** Transición disparada por un evento entrante. Devuelve el estado nuevo o null. */
  async applyEvent(tenantId: string, profileId: string, eventType: string): Promise<string | null> {
    const def = await this.getActiveDefinition(tenantId);
    if (!def) return null;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { lifecycleState: true, custom: true },
      });
      if (!profile) return null;
      const hit = evaluateOnEvent(
        def,
        profile.lifecycleState,
        eventType,
        (profile.custom as Record<string, unknown>) ?? {},
      );
      if (!hit) return null;
      await tx.profile.update({ where: { id: profileId }, data: { lifecycleState: hit.to } });
      await tx.lifecycleState.create({
        data: {
          tenantId,
          profileId,
          state: hit.to,
          previous: profile.lifecycleState,
          reason: hit.reason,
        },
      });
      return hit.to;
    });
  }

  /**
   * Barrido de reglas temporales («sin compra en 90 días → dormido»). Se
   * ejecuta como job diario por tenant. Devuelve cuántos perfiles cambiaron.
   */
  async sweep(tenantId: string, now = new Date()): Promise<number> {
    const def = await this.getActiveDefinition(tenantId);
    if (!def) return 0;
    const temporalTypes = [
      ...new Set(
        def.transitions
          .map((t) => t.when.inactivityDays)
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
          .map((x) => x.eventType ?? '*'),
      ),
    ];
    if (temporalTypes.length === 0) return 0;

    let changed = 0;
    // Lotes pequeños: el barrido es diario y el volumen de piloto, modesto.
    const profiles = await this.prisma.withTenant(tenantId, (tx) =>
      tx.profile.findMany({ select: { id: true, lifecycleState: true, custom: true }, take: 5000 }),
    );
    for (const p of profiles) {
      const lastEventAt: Record<string, Date | undefined> = {};
      await this.prisma.withTenant(tenantId, async (tx) => {
        for (const type of temporalTypes) {
          const last = await tx.event.findFirst({
            where: { profileId: p.id, ...(type === '*' ? {} : { type }) },
            orderBy: { occurredAt: 'desc' },
            select: { occurredAt: true },
          });
          lastEventAt[type] = last?.occurredAt;
        }
      });
      const hit = evaluateInactivity(
        def,
        p.lifecycleState,
        lastEventAt,
        now,
        (p.custom as Record<string, unknown>) ?? {},
      );
      if (!hit) continue;
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.profile.update({ where: { id: p.id }, data: { lifecycleState: hit.to } });
        await tx.lifecycleState.create({
          data: { tenantId, profileId: p.id, state: hit.to, previous: p.lifecycleState, reason: hit.reason },
        });
      });
      changed++;
    }
    if (changed) this.logger.log(`lifecycle sweep ${tenantId}: ${changed} perfiles transicionados`);
    return changed;
  }
}
