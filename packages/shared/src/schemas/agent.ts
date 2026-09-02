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

export const agentStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
// The Agent.type stored in the DB is the *runtime engine*, not the wizard
// purpose. (UTILITY se retiró en E2: nunca tuvo runner; el valor sigue en el
// enum de Postgres solo como resto histórico.)
export const agentTypeSchema = z.enum(['CONVERSATIONAL', 'OPPORTUNITIES']);

export type AgentType = z.infer<typeof agentTypeSchema>;

// Structured settings stored in Agent.config (Json):
//   CONVERSATIONAL → language, tone, businessInfo*, faqs*, aiDisclosure, tools, support
//     (*deprecated en E1: migran a Conocimiento; el motor no los lee)
//   OPPORTUNITIES  → defaults del modal de scoring por lote
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
  // CONVERSATIONAL — identidad del asistente
  language: z.string().trim().max(20).optional(),
  tone: z.string().trim().max(160).optional(),
  /** DEPRECATED (E1): migrado a Conocimiento; el motor no lo lee. */
  businessInfo: z.string().trim().max(8000).optional(),
  /** DEPRECATED (E1): migrado a Conocimiento; el motor no lo lee. */
  faqs: z.string().trim().max(8000).optional(),
  aiDisclosure: z.string().trim().max(500).optional(),
  tools: z.array(z.enum(AGENT_TOOLS)).max(AGENT_TOOLS.length).optional(),
  // OPPORTUNITIES — defaults del modal de scoring por lote.
  defaultUpdateStatus: z.boolean().optional(),
  defaultCreateOpportunities: z.boolean().optional(),
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
