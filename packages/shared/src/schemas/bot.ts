import { z } from 'zod';

export const channelSchema = z.enum([
  'WHATSAPP',
  'INSTAGRAM',
  'MESSENGER',
  'WEBCHAT',
  'EMAIL',
]);

export const botStatusSchema = z.enum([
  'PENDING',
  'AWAITING_QR',
  'CONNECTING',
  'CONNECTED',
  'DISCONNECTED',
  'BANNED',
  'ERROR',
]);

export const botReplyModeSchema = z.enum(['OFF', 'SUGGEST', 'AUTO']);

export const createBotSchema = z.object({
  name: z.string().trim().min(2).max(60),
  channel: channelSchema,
  agentId: z.string().cuid().optional(),
  // Channel address. For EMAIL = the inbound address that receives customer
  // emails (and is the Reply-To). For WhatsApp it's captured on connect.
  phoneNumber: z.string().trim().max(160).optional(),
  replyMode: botReplyModeSchema.optional(),
});

export const updateBotSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  agentId: z.union([z.string().cuid(), z.null()]).optional(),
  replyMode: botReplyModeSchema.optional(),
});

export type CreateBotInput = z.infer<typeof createBotSchema>;
export type UpdateBotInput = z.infer<typeof updateBotSchema>;

export const botEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('qr'),
    botId: z.string(),
    qr: z.string(),
  }),
  z.object({
    type: z.literal('status'),
    botId: z.string(),
    status: botStatusSchema,
    phoneNumber: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('message_in'),
    botId: z.string(),
    from: z.string(),
    text: z.string().optional(),
    mediaUrl: z.string().optional(),
    timestamp: z.number(),
  }),
]);

export type BotEvent = z.infer<typeof botEventSchema>;
