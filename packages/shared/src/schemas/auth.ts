import { z } from 'zod';
import { PASSWORD_RULES } from '../constants';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
  .string()
  .min(PASSWORD_RULES.minLength, `Mínimo ${PASSWORD_RULES.minLength} caracteres`)
  .max(128)
  .refine((v) => !PASSWORD_RULES.requireUpper || /[A-Z]/.test(v), {
    message: 'Debe contener al menos una mayúscula',
  })
  .refine((v) => !PASSWORD_RULES.requireLower || /[a-z]/.test(v), {
    message: 'Debe contener al menos una minúscula',
  })
  .refine((v) => !PASSWORD_RULES.requireNumber || /[0-9]/.test(v), {
    message: 'Debe contener al menos un número',
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const adminLoginSchema = loginSchema.extend({
  totp: z
    .string()
    .regex(/^\d{6}$/, 'Código de 6 dígitos')
    .optional(),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(100),
  tenantName: z.string().trim().min(2).max(100),
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
});

export type SignupInput = z.infer<typeof signupSchema>;
