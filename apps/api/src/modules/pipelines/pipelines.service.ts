import { Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  createPipelineSchema,
  updatePipelineSchema,
  type CreatePipelineInput,
  type UpdatePipelineInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

interface StageRow {
  id: string;
  pipelineId: string;
  key: string;
  label: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

type OppStatusValue = 'OPEN' | 'QUOTED' | 'NEGOTIATING' | 'WON' | 'LOST';

/**
 * Resuelve la etapa de un pipeline para un status dado (WON/LOST/otra key),
 * con fallback a la primera etapa en orden. MISMO criterio para el alta
 * manual de una Oportunidad (`OpportunitiesService.create`) y el alta
 * automática desde una compra de e-commerce (`PurchaseOpportunityService`) —
 * una sola fuente de verdad, en vez de reimplementar "cuál es la etapa
 * ganadora" en cada sitio que crea una Oportunidad.
 */
export function resolveStageForStatus(
  pipeline: { stages: StageRow[] } | null | undefined,
  status?: string,
): StageRow | undefined {
  if (!pipeline || pipeline.stages.length === 0) return undefined;
  let candidate = pipeline.stages[0];
  if (status === 'WON') candidate = pipeline.stages.find((s) => s.isWon) ?? candidate;
  else if (status === 'LOST') candidate = pipeline.stages.find((s) => s.isLost) ?? candidate;
  else if (status) {
    const byKey = pipeline.stages.find((s) => s.key === status);
    if (byKey) candidate = byKey;
  }
  return candidate;
}

/** El status real de una Oportunidad lo manda la etapa en la que vive
 *  (isWon/isLost), no lo que se pida — evita un status "WON" en una etapa
 *  que no lo es. `fallback` cubre etapas intermedias sin marcar. */
export function syncStatusFromStage(
  stage: { isWon: boolean; isLost: boolean; key: string },
  fallback: OppStatusValue,
): OppStatusValue {
  if (stage.isWon) return 'WON';
  if (stage.isLost) return 'LOST';
  const known = ['OPEN', 'QUOTED', 'NEGOTIATING'] as const;
  if ((known as readonly string[]).includes(stage.key)) {
    return stage.key as 'OPEN' | 'QUOTED' | 'NEGOTIATING';
  }
  if (fallback === 'WON' || fallback === 'LOST') return 'OPEN';
  return fallback;
}

@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, opts: { includeArchived?: boolean } = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.pipeline.findMany({
        where: { archivedAt: opts.includeArchived ? undefined : null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: { stages: { orderBy: { order: 'asc' } } },
      }),
    );
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const p = await tx.pipeline.findUnique({
        where: { id },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
      if (!p) throw new NotFoundError('Tablero no encontrado');
      return p;
    });
  }

  /**
   * Returns the default pipeline (with stages) for opportunities.
   * Used by opportunities.service to assign a stage when none is provided.
   */
  async getDefault(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const p = await tx.pipeline.findFirst({
        where: { entityType: 'OPPORTUNITY', isDefault: true, archivedAt: null },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
      if (p) return p;
      // Fallback: any non-archived pipeline (shouldn't usually happen — seed
      // creates one per tenant).
      return tx.pipeline.findFirst({
        where: { entityType: 'OPPORTUNITY', archivedAt: null },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
    });
  }

  async create(tenantId: string, input: CreatePipelineInput) {
    const data = createPipelineSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existingByName = await tx.pipeline.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
      });
      if (existingByName) throw new ConflictError('Ya existe un tablero con ese nombre');

      if (data.isDefault) {
        await tx.pipeline.updateMany({
          where: { tenantId, entityType: 'OPPORTUNITY' },
          data: { isDefault: false },
        });
      }
      const pipeline = await tx.pipeline.create({
        data: {
          tenantId,
          name: data.name,
          entityType: data.entityType ?? 'OPPORTUNITY',
          isDefault: data.isDefault ?? false,
        },
      });
      await tx.pipelineStage.createMany({
        data: data.stages.map((s, i) => ({
          tenantId,
          pipelineId: pipeline.id,
          key: s.key,
          label: s.label,
          color: s.color,
          order: s.order ?? i,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
        })),
      });
      return tx.pipeline.findUnique({
        where: { id: pipeline.id },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
    });
  }

  async update(tenantId: string, id: string, input: UpdatePipelineInput) {
    const data = updatePipelineSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const pipeline = await tx.pipeline.findUnique({
        where: { id },
        include: { stages: true },
      });
      if (!pipeline) throw new NotFoundError('Tablero no encontrado');

      if (data.isDefault) {
        await tx.pipeline.updateMany({
          where: { tenantId, entityType: 'OPPORTUNITY' },
          data: { isDefault: false },
        });
      }

      await tx.pipeline.update({
        where: { id },
        data: {
          name: data.name,
          isDefault: data.isDefault,
          archivedAt:
            data.archived === undefined ? undefined : data.archived ? new Date() : null,
        },
      });

      if (data.stages) {
        await this.syncStages(tx, tenantId, pipeline.id, pipeline.stages as StageRow[], data.stages);
      }

      return tx.pipeline.findUnique({
        where: { id },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
    });
  }

  private async syncStages(
    tx: Parameters<Parameters<PrismaService['withTenant']>[1]>[0],
    tenantId: string,
    pipelineId: string,
    existing: StageRow[],
    incoming: UpdatePipelineInput['stages'] & object,
  ) {
    if (!incoming) return;
    const existingByKey = new Map(existing.map((s) => [s.key, s]));
    const incomingByKey = new Map(incoming.map((s) => [s.key, s]));

    // Stages removed: only if no opportunities reference them; otherwise refuse.
    for (const ex of existing) {
      if (!incomingByKey.has(ex.key)) {
        const usage = await tx.opportunity.count({ where: { stageId: ex.id } });
        if (usage > 0) {
          throw new BadRequestError(
            `No puedes eliminar la etapa "${ex.label}" porque tiene oportunidades. Muévelas primero.`,
          );
        }
        await tx.pipelineStage.delete({ where: { id: ex.id } });
      }
    }

    // Upsert each incoming stage by (pipelineId, key).
    let i = 0;
    for (const s of incoming) {
      const ex = existingByKey.get(s.key);
      if (ex) {
        await tx.pipelineStage.update({
          where: { id: ex.id },
          data: {
            label: s.label,
            color: s.color,
            order: s.order ?? i,
            isWon: s.isWon ?? false,
            isLost: s.isLost ?? false,
          },
        });
      } else {
        await tx.pipelineStage.create({
          data: {
            tenantId,
            pipelineId,
            key: s.key,
            label: s.label,
            color: s.color,
            order: s.order ?? i,
            isWon: s.isWon ?? false,
            isLost: s.isLost ?? false,
          },
        });
      }
      i += 1;
    }
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const pipeline = await tx.pipeline.findUnique({
        where: { id },
        include: { _count: { select: { opportunities: true } } },
      });
      if (!pipeline) throw new NotFoundError('Tablero no encontrado');
      if (pipeline.isDefault) {
        throw new BadRequestError('No puedes eliminar el tablero por defecto');
      }
      if (pipeline._count.opportunities > 0) {
        throw new BadRequestError(
          'El tablero tiene oportunidades asociadas. Archívalo o mueve las oportunidades.',
        );
      }
      await tx.pipeline.delete({ where: { id } });
    });
  }
}
