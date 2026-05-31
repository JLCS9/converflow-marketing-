import { z } from 'zod';

export const pipelineEntitySchema = z.enum(['OPPORTUNITY']);
export type PipelineEntity = z.infer<typeof pipelineEntitySchema>;

export const pipelineStageInputSchema = z
  .object({
    id: z.string().cuid().optional(),
    key: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{0,39}$/, 'key debe ser mayúsculas/números/_ (1-40)'),
    label: z.string().trim().min(1).max(80),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'color debe ser #RRGGBB'),
    order: z.number().int().min(0).max(1000),
    isWon: z.boolean().optional(),
    isLost: z.boolean().optional(),
  })
  .refine((s) => !(s.isWon && s.isLost), 'Una etapa no puede ser ganada y perdida a la vez');

export const createPipelineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  entityType: pipelineEntitySchema.optional(),
  isDefault: z.boolean().optional(),
  stages: z.array(pipelineStageInputSchema).min(1).max(20),
});

export const updatePipelineSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
  stages: z.array(pipelineStageInputSchema).min(1).max(20).optional(),
});

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;

export const moveOpportunityStageSchema = z.object({
  stageId: z.string().cuid(),
});
export type MoveOpportunityStageInput = z.infer<typeof moveOpportunityStageSchema>;
