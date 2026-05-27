import { z } from 'zod';

export const channelSchema = z.enum([
  'WHATSAPP',
  'INSTAGRAM',
  'MESSENGER',
  'WEBCHAT',
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

export const createBotSchema = z.object({
  name: z.string().trim().min(2).max(60),
  channel: channelSchema,
  agentId: z.string().cuid().optional(),
});

export type CreateBotInput = z.infer<typeof createBotSchema>;

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
