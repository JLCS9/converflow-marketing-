import { z } from 'zod';

export const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(200).optional(),
  bodyHtml: z.string().trim().min(1).max(200000), // compiled MJML HTML can be large
  mjml: z.string().trim().max(200000).optional(), // builder source
});

export const updateEmailTemplateSchema = createEmailTemplateSchema.partial();

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
