import { z } from 'zod';

export const MessageTypeSchema = z.enum(['text', 'file', 'system']);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().cuid2(),
  meeting_id: z.string().cuid2(),
  sender_user_id: z.string().cuid2().nullable(),
  sender_guest_name: z.string().nullable(),
  content: z.string().min(1).max(10000),
  message_type: MessageTypeSchema,
  file_url: z.string().url().nullable(),
  created_at: z.coerce.date(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatMessageCreateInputSchema = ChatMessageSchema.omit({
  id: true,
  created_at: true,
});
export type ChatMessageCreateInput = z.infer<typeof ChatMessageCreateInputSchema>;

export const ChatMessageUpdateInputSchema = ChatMessageCreateInputSchema.partial();
export type ChatMessageUpdateInput = z.infer<typeof ChatMessageUpdateInputSchema>;
