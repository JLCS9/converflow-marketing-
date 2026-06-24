import { z } from 'zod';

export const createEmailTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    subject: z.string().trim().max(200).optional(),
    // The visual builder sends `mjml`; the server compiles it to bodyHtml. Legacy
    // simple templates may send bodyHtml directly. At least one is required.
    bodyHtml: z.string().trim().max(400000).optional(),
    mjml: z.string().trim().max(200000).optional(),
  })
  .refine((v) => Boolean(v.mjml?.trim() || v.bodyHtml?.trim()), {
    message: 'El diseño está vacío',
    path: ['mjml'],
  });

export const updateEmailTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().max(200).optional(),
  bodyHtml: z.string().trim().max(400000).optional(),
  mjml: z.string().trim().max(200000).optional(),
});

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
