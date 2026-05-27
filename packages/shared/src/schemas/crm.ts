import { z } from 'zod';

// ============================================
// Leads
// ============================================

export const leadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'CONVERTED',
  'LOST',
]);

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(150).optional(),
  source: z.string().trim().max(60).optional(),
  status: leadStatusSchema.optional(),
  ownerId: z.string().cuid().optional(),
  customFields: z.record(z.unknown()).optional(),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  status: leadStatusSchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// CSV import — accepts an array of leads at once
export const importLeadsSchema = z.object({
  leads: z.array(createLeadSchema).min(1).max(1000),
});
export type ImportLeadsInput = z.infer<typeof importLeadsSchema>;

// ============================================
// Opportunities
// ============================================

export const oppStatusSchema = z.enum([
  'OPEN',
  'QUOTED',
  'NEGOTIATING',
  'WON',
  'LOST',
]);

export const createOpportunitySchema = z.object({
  name: z.string().trim().min(1).max(150),
  leadId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).default('EUR'),
  status: oppStatusSchema.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.coerce.date().optional(),
  ownerId: z.string().cuid().optional(),
  proposalUrl: z.string().url().optional(),
});

export const updateOpportunitySchema = createOpportunitySchema.partial();

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

// ============================================
// Clients
// ============================================

export const clientStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(40).optional(),
  nif: z.string().trim().max(20).optional(),
  address: z.string().trim().max(255).optional(),
  website: z.string().url().optional(),
  source: z.string().trim().max(60).optional(),
  status: clientStatusSchema.optional(),
  ownerId: z.string().cuid().optional(),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// ============================================
// Tasks
// ============================================

export const taskTypeSchema = z.enum([
  'CALL',
  'EMAIL',
  'MEETING',
  'FOLLOW_UP',
  'OTHER',
]);

export const taskStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
]);

export const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  type: taskTypeSchema,
  priority: prioritySchema.optional(),
  status: taskStatusSchema.optional(),
  ownerId: z.string().cuid().optional(),
  dueAt: z.coerce.date().optional(),
  clientId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  opportunityId: z.string().cuid().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
