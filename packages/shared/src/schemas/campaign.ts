import { z } from 'zod';

// Channels usable for outbound campaigns. WEBCHAT is inbound-only; INSTAGRAM /
// MESSENGER aren't implemented yet — so the picker only ever offers the ones
// with a connected bot, but we constrain the type here too.
export const CAMPAIGN_CHANNELS = ['EMAIL', 'WHATSAPP'] as const;

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'CANCELLED',
  'FAILED',
] as const;

// Audience = a filter over leads/clients + manual include/exclude on top.
// entity decides which tables we draw from.
export const audienceSchema = z.object({
  entity: z.enum(['LEAD', 'CLIENT', 'BOTH']).default('BOTH'),
  statuses: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  sources: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  ownerId: z.string().cuid().optional(),
  // Manual tweaks layered on top of the filter result.
  includeLeadIds: z.array(z.string().cuid()).max(5000).optional(),
  includeClientIds: z.array(z.string().cuid()).max(5000).optional(),
  excludeLeadIds: z.array(z.string().cuid()).max(5000).optional(),
  excludeClientIds: z.array(z.string().cuid()).max(5000).optional(),
});

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    channel: z.enum(CAMPAIGN_CHANNELS).default('EMAIL'),
    botId: z.string().cuid().optional(),
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().min(1).max(8000),
    audience: audienceSchema.optional(),
    // ISO 8601; null/undefined = send immediately on launch.
    scheduledAt: z.string().datetime().optional(),
  })
  .refine((v) => v.channel !== 'EMAIL' || (v.subject && v.subject.trim().length > 0), {
    message: 'El asunto es obligatorio para campañas de email',
    path: ['subject'],
  });

export const updateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  channel: z.enum(CAMPAIGN_CHANNELS).optional(),
  botId: z.string().cuid().nullable().optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(8000).optional(),
  audience: audienceSchema.optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export const previewAudienceSchema = audienceSchema;

export type AudienceInput = z.infer<typeof audienceSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
