import { z } from 'zod';
import { KIT_DIGITAL_SEGMENTS } from '../constants';

export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones');

export const updateTenantLimitsSchema = z.object({
  maxUsers: z.number().int().min(1).max(1000).optional(),
  maxBots: z.number().int().min(0).max(100).optional(),
  maxConversationsPerMonth: z.number().int().min(0).optional(),
  maxStorageGb: z.number().int().min(0).max(1000).optional(),
  kitDigitalSegment: z.enum(KIT_DIGITAL_SEGMENTS).nullable().optional(),
});

export type UpdateTenantLimitsInput = z.infer<typeof updateTenantLimitsSchema>;

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: tenantSlugSchema,
  contactEmail: z.string().trim().toLowerCase().email(),
  contactPhone: z.string().trim().max(40).optional(),
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerName: z.string().trim().min(2).max(100),
  kitDigitalSegment: z.enum(KIT_DIGITAL_SEGMENTS).optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
