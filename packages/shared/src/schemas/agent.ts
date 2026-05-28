import { z } from 'zod';

export const AGENT_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] as const;

export const AGENT_TOOLS = [
  'schedule_meeting', // propose/create a Google Calendar meeting
  'create_opportunity', // open a new opportunity for the lead
  'update_opportunity', // change stage/amount of an existing opportunity
  'escalate_to_human', // hand the conversation to a person
] as const;

export const agentModeSchema = z.enum(['SUGGEST', 'AUTO']);
export const agentStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

// Structured settings stored in Agent.config (Json).
export const agentConfigSchema = z.object({
  language: z.string().trim().max(20).optional(),
  tone: z.string().trim().max(160).optional(),
  businessInfo: z.string().trim().max(8000).optional(),
  faqs: z.string().trim().max(8000).optional(),
  aiDisclosure: z.string().trim().max(500).optional(),
  tools: z.array(z.enum(AGENT_TOOLS)).max(AGENT_TOOLS.length).optional(),
  mode: agentModeSchema.optional(),
});

export const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  systemPrompt: z.string().trim().min(1).max(8000),
  model: z.enum(AGENT_MODELS).optional(),
  status: agentStatusSchema.optional(),
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
