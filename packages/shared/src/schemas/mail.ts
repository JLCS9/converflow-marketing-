import { z } from 'zod';

export const MAIL_DRIVERS = [
  'SMTP_IMAP',
  'OAUTH_GOOGLE',
  'OAUTH_MICROSOFT',
  'PROVIDER_API',
] as const;
export const MAIL_VISIBILITY = ['SHARED', 'PRIVATE'] as const;

const emailField = z.string().trim().toLowerCase().email().max(254);

// Fase 1 ships the smtp_imap driver; the schema already models the other drivers
// so the API/UI don't change shape when they land.
export const createMailConnectionSchema = z
  .object({
    driver: z.enum(MAIL_DRIVERS).default('SMTP_IMAP'),
    fromAddress: emailField,
    displayName: z.string().trim().max(120).optional(),
    signature: z.string().trim().max(8000).optional(),
    visibility: z.enum(MAIL_VISIBILITY).default('SHARED'),

    // smtp_imap connection details
    imapHost: z.string().trim().max(255).optional(),
    imapPort: z.number().int().min(1).max(65535).optional(),
    smtpHost: z.string().trim().max(255).optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    username: z.string().trim().max(255).optional(),
    secret: z.string().min(1).max(2000).optional(), // plaintext from the form; encrypted server-side
    secure: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.driver === 'SMTP_IMAP') {
      for (const f of ['imapHost', 'smtpHost', 'username', 'secret'] as const) {
        if (!v[f]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [f],
            message: 'Obligatorio para una conexión SMTP/IMAP',
          });
        }
      }
    }
  });

export const updateMailConnectionSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  signature: z.string().trim().max(8000).nullable().optional(),
  visibility: z.enum(MAIL_VISIBILITY).optional(),
  imapHost: z.string().trim().max(255).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  smtpHost: z.string().trim().max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  username: z.string().trim().max(255).optional(),
  secret: z.string().min(1).max(2000).optional(), // only re-encrypted when present
  secure: z.boolean().optional(),
});

export const mailTestSendSchema = z.object({ to: emailField });

export type CreateMailConnectionInput = z.infer<typeof createMailConnectionSchema>;
export type UpdateMailConnectionInput = z.infer<typeof updateMailConnectionSchema>;
