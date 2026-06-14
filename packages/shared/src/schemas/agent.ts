import { z } from 'zod';

export const AGENT_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] as const;

export const AGENT_TOOLS = [
  'schedule_meeting', // propose/create a Google Calendar meeting
  'create_opportunity', // open a new opportunity for the lead
  'update_opportunity', // change stage/amount of an existing opportunity
  'escalate_to_human', // hand the conversation to a person
  'create_support_task', // open a support ticket, route to a responsible + notify by email
] as const;

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

// LEGACY: reply mode used to live on the agent. It is now a Bot field
// (Bot.replyMode). Schema kept for one deploy so old clients still validate.
export const agentModeSchema = z.enum(['SUGGEST', 'AUTO']);
export const agentStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
// The Agent.type stored in the DB is the *runtime engine*, not the wizard
// purpose. The 12 funnel pieces the wizard shows collapse into these three.
export const agentTypeSchema = z.enum([
  'CONVERSATIONAL',
  'OPPORTUNITIES',
  'UTILITY',
]);

export type AgentType = z.infer<typeof agentTypeSchema>;

// Structured settings stored in Agent.config (Json). Varies by Agent.type:
//   CONVERSATIONAL → language, tone, businessInfo, faqs, aiDisclosure, tools
//   SCORING        → defaultPipelineId, defaultUpdateStatus, defaultCreateOpportunities
//   TRIAGE         → products[], fallbackOwnerId  (future)
// `mode` stays as a soft-deprecated alias of Bot.replyMode for one deploy.
// Per-product routing for AGENDA_PROPOSAL agents.
export const productOwnerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ownerId: z.string().cuid().optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export const leadSourceSchema = z.enum(['IMPORT', 'AUTOMATIC']);

// SUPPORT — topic→responsible routing for auto-created support tickets.
// A route matches when the AI-chosen topic equals route.topic OR any of its
// keywords appears in the conversation text. The matched route's ownerId gets
// the task + an email notification; `fallbackOwnerId` catches the rest.
export const supportRouteSchema = z.object({
  topic: z.string().trim().min(1).max(60),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  ownerId: z.string().cuid(),
});

export const supportConfigSchema = z.object({
  enabled: z.boolean().optional(),
  routes: z.array(supportRouteSchema).max(50).optional(),
  fallbackOwnerId: z.string().cuid().optional(),
  defaultPriority: z.enum(TASK_PRIORITIES).optional(),
});

export const agentConfigSchema = z.object({
  // CONVERSATIONAL
  language: z.string().trim().max(20).optional(),
  tone: z.string().trim().max(160).optional(),
  businessInfo: z.string().trim().max(8000).optional(),
  faqs: z.string().trim().max(8000).optional(),
  aiDisclosure: z.string().trim().max(500).optional(),
  tools: z.array(z.enum(AGENT_TOOLS)).max(AGENT_TOOLS.length).optional(),
  mode: agentModeSchema.optional(),
  // OPPORTUNITIES — legacy "default" flags kept for the bulk-score modal.
  defaultPipelineId: z.string().cuid().optional(),
  defaultUpdateStatus: z.boolean().optional(),
  defaultCreateOpportunities: z.boolean().optional(),
  // OPPORTUNITIES — new opportunity-engine fields (Commit D).
  /** Where leads come from. IMPORT = CSV upload, AUTOMATIC = inbound channels. */
  leadSource: leadSourceSchema.optional(),
  /** Score ≥ thresholdClient → state = CLIENT. */
  thresholdClient: z.number().int().min(0).max(100).optional(),
  /** Score ≤ thresholdLost → state = LOST. Anything in between stays LEAD. */
  thresholdLost: z.number().int().min(0).max(100).optional(),
  /** Open an opportunity when the score is decided. */
  actionOpenOpportunity: z.boolean().optional(),
  /** Assign owner from the opportunity defaults. */
  actionAssignOwner: z.boolean().optional(),
  /** Create a follow-up task when score is above this threshold (off when undefined). */
  actionCreateTaskAbove: z.number().int().min(0).max(100).optional(),
  /** Vigilancia: open a task if an opportunity goes N days without activity. */
  watcherDaysWithoutActivity: z.number().int().min(0).max(365).optional(),
  // AGENDA_PROPOSAL
  invitationTemplate: z.string().trim().max(2000).optional(),
  productOwners: z.array(productOwnerSchema).max(50).optional(),
  defaultMeetingDurationMin: z.number().int().min(15).max(240).optional(),
  // SUPPORT / tickets — auto-create + route + email a responsible.
  support: supportConfigSchema.optional(),
});

export const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  systemPrompt: z.string().trim().min(1).max(8000),
  model: z.enum(AGENT_MODELS).optional(),
  status: agentStatusSchema.optional(),
  type: agentTypeSchema.optional(),
  // Wizard template id the agent was created from (analytics + prefill).
  // Free-form string so adding new wizard tiles never touches the API.
  template: z.string().trim().max(40).optional(),
  config: agentConfigSchema.optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export const testAgentSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type SupportConfig = z.infer<typeof supportConfigSchema>;
export type SupportRoute = z.infer<typeof supportRouteSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type TestAgentInput = z.infer<typeof testAgentSchema>;

export const DEFAULT_AI_DISCLOSURE =
  'Hola, soy un asistente de IA. Puedo ayudarte, aunque a veces puedo equivocarme; si lo necesitas, te paso con una persona.';
