import { z } from 'zod';

export const AGENT_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] as const;

export const AGENT_TOOLS = [
  'schedule_meeting', // propose/create a Google Calendar meeting
  'create_opportunity', // open a new opportunity for the lead
  'update_opportunity', // change stage/amount of an existing opportunity
  'escalate_to_human', // hand the conversation to a person
] as const;

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

export const agentConfigSchema = z.object({
  // CONVERSATIONAL
  language: z.string().trim().max(20).optional(),
  tone: z.string().trim().max(160).optional(),
  businessInfo: z.string().trim().max(8000).optional(),
  faqs: z.string().trim().max(8000).optional(),
  aiDisclosure: z.string().trim().max(500).optional(),
  tools: z.array(z.enum(AGENT_TOOLS)).max(AGENT_TOOLS.length).optional(),
  mode: agentModeSchema.optional(),
  // SCORING
  defaultPipelineId: z.string().cuid().optional(),
  defaultUpdateStatus: z.boolean().optional(),
  defaultCreateOpportunities: z.boolean().optional(),
  // AGENDA_PROPOSAL
  invitationTemplate: z.string().trim().max(2000).optional(),
  productOwners: z.array(productOwnerSchema).max(50).optional(),
  defaultMeetingDurationMin: z.number().int().min(15).max(240).optional(),
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
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type TestAgentInput = z.infer<typeof testAgentSchema>;

export const DEFAULT_AI_DISCLOSURE =
  'Hola, soy un asistente de IA. Puedo ayudarte, aunque a veces puedo equivocarme; si lo necesitas, te paso con una persona.';
