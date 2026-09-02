import { z } from 'zod';

/**
 * Esquema común del plano de datos. Todo adaptador (Brevo, LearnDash,
 * WooCommerce, CSV, el correo actual…) traduce su origen a ESTA forma y nada
 * más — misma filosofía que el proveedor de LLM: los sistemas del cliente son
 * intercambiables detrás del adaptador.
 */
export const eventIdentitySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320).optional(),
    phone: z.string().trim().min(5).max(32).optional(),
    waId: z.string().trim().min(5).max(32).optional(),
  })
  .refine((v) => v.email || v.phone || v.waId, {
    message: 'identity necesita al menos email, phone o waId',
  });

export const eventInputSchema = z.object({
  /** Enum abierto en snake_case: 'purchase', 'enrollment', 'email_open'… */
  type: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_.]{1,79}$/, 'type en snake_case (p. ej. email_open)'),
  /** Cuándo ocurrió en el sistema origen; por defecto, ahora. */
  occurredAt: z.coerce.date().optional(),
  /** Id en el sistema origen — dedupe de webhooks reentregados. */
  externalId: z.string().trim().min(1).max(200).optional(),
  /** A quién le pasó. Opcional: hay eventos sin persona (p. ej. sync). */
  identity: eventIdentitySchema.optional(),
  /** Propiedades específicas del tipo; los consumidores toleran ausencias. */
  props: z.record(z.unknown()).optional(),
});

export const eventBatchSchema = z.object({
  /** Adaptador emisor: 'brevo' | 'learndash' | 'woocommerce' | 'crm' | 'api'… */
  source: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_-]{1,39}$/),
  events: z.array(eventInputSchema).min(1).max(500),
});

export type EventInput = z.infer<typeof eventInputSchema>;
export type EventBatchInput = z.infer<typeof eventBatchSchema>;
