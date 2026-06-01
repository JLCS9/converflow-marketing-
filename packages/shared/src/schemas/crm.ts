import { z } from 'zod';

// ============================================
// Leads
// ============================================

// 3-state model: a contact is a LEAD until you mark them CLIENT (or LOST).
// Old keys (NEW/CONTACTED/QUALIFIED/CONVERTED) still accepted on input as
// aliases so older clients keep working; the API normalises them to the new
// triplet before persisting.
export const leadStatusSchema = z.enum(['LEAD', 'CLIENT', 'LOST']);

const incomingStatusSchema = z
  .enum(['LEAD', 'CLIENT', 'LOST', 'NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'])
  .transform((s): 'LEAD' | 'CLIENT' | 'LOST' => {
    if (s === 'CONVERTED' || s === 'CLIENT') return 'CLIENT';
    if (s === 'LOST') return 'LOST';
    return 'LEAD';
  });

// Empty strings are tolerated and treated as "no value" so the CSV importer
// doesn't trip on cells the user left blank.
const optionalEmail = z
  .union([z.string().trim().toLowerCase().email(), z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalUrl = z
  .union([z.string().trim().url(), z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalTrimmed = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined));

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(150),
  lastName: optionalTrimmed(150),
  email: optionalEmail,
  phone: optionalTrimmed(40),
  company: optionalTrimmed(150),
  nif: optionalTrimmed(20),
  address: optionalTrimmed(255),
  website: optionalUrl,
  source: optionalTrimmed(60),
  status: incomingStatusSchema.optional(),
  ownerId: z.string().cuid().optional(),
  customFields: z.record(z.unknown()).optional(),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  status: incomingStatusSchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// CSV import — accepts an array of raw rows. The bulkImport service validates
// each row individually so one bad cell doesn't kill the whole batch.
export const importLeadsSchema = z.object({
  leads: z.array(z.record(z.unknown())).min(1).max(1000),
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
  pipelineId: z.string().cuid().optional(),
  stageId: z.string().cuid().optional(),
  customFields: z.record(z.unknown()).optional(),
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
  customFields: z.record(z.unknown()).optional(),
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

// ============================================
// Notes
// ============================================

export const createNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    leadId: z.string().cuid().optional(),
    clientId: z.string().cuid().optional(),
    opportunityId: z.string().cuid().optional(),
  })
  .refine(
    (d) => Boolean(d.leadId || d.clientId || d.opportunityId),
    'Una nota debe enlazar a un lead, cliente u oportunidad',
  );

export const updateNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

// ============================================
// Tasks
// ============================================

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

// ============================================
// Meetings (Sprint 5 — IA Reuniones / Google Calendar)
// ============================================
export const proposeMeetingSchema = z.object({
  leadId: z.string().cuid(),
  durationMin: z.number().int().min(15).max(240).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const scheduleMeetingSchema = z.object({
  leadId: z.string().cuid(),
  startIso: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(240),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  createTask: z.boolean().optional(),
});

export type ProposeMeetingInput = z.infer<typeof proposeMeetingSchema>;
export type ScheduleMeetingInput = z.infer<typeof scheduleMeetingSchema>;
