import { z } from 'zod';

export const customFieldEntitySchema = z.enum(['LEAD', 'CLIENT', 'OPPORTUNITY']);
export type CustomFieldEntity = z.infer<typeof customFieldEntitySchema>;

export const customFieldTypeSchema = z.enum([
  'TEXT',
  'LONGTEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTISELECT',
  'URL',
  'EMAIL',
  'PHONE',
  'DOCUMENT',
]);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

export const customFieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
});
export type CustomFieldOption = z.infer<typeof customFieldOptionSchema>;

export const createCustomFieldSchema = z
  .object({
    entityType: customFieldEntitySchema,
    label: z.string().trim().min(1).max(120),
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, 'key debe ser minúsculas, números o _ (1-40)')
      .optional(),
    type: customFieldTypeSchema,
    required: z.boolean().optional(),
    options: z.array(customFieldOptionSchema).max(50).optional(),
    helpText: z.string().trim().max(280).optional(),
    order: z.number().int().min(0).max(10000).optional(),
  })
  .refine(
    (d) => (d.type !== 'SELECT' && d.type !== 'MULTISELECT') || (d.options && d.options.length > 0),
    'SELECT y MULTISELECT necesitan al menos una opción',
  );

export const updateCustomFieldSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    required: z.boolean().optional(),
    options: z.array(customFieldOptionSchema).max(50).optional(),
    helpText: z.string().trim().max(280).optional(),
    order: z.number().int().min(0).max(10000).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const reorderCustomFieldsSchema = z.object({
  entityType: customFieldEntitySchema,
  ids: z.array(z.string().cuid()).min(1).max(100),
});

export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;
export type ReorderCustomFieldsInput = z.infer<typeof reorderCustomFieldsSchema>;

// Custom field VALUES stored in the entity's customFields Json.
// Validation against definitions happens server-side at create/update time.
// Document fields store { documentId, name, mime?, size? }.
export const customFieldDocumentValueSchema = z.object({
  documentId: z.string().cuid(),
  name: z.string().min(1).max(255),
  mime: z.string().max(100).optional(),
  size: z.number().int().nonnegative().optional(),
});
export type CustomFieldDocumentValue = z.infer<typeof customFieldDocumentValueSchema>;
