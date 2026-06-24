import { z } from 'zod';

export const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(200).optional(),
  bodyHtml: z.string().trim().min(1).max(20000),
});

export const updateEmailTemplateSchema = createEmailTemplateSchema.partial();

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
