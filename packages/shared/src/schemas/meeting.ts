import { z } from 'zod';

export const MeetingStatusSchema = z.enum(['scheduled', 'active', 'ended', 'cancelled']);
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;

export const MeetingSchema = z.object({
  id: z.string().cuid2(),
  organization_id: z.string().cuid2(),
  host_user_id: z.string().cuid2(),
  title: z.string().min(1).max(300),
  description: z.string().nullable(),
  scheduled_at: z.coerce.date().nullable(),
  started_at: z.coerce.date().nullable(),
  ended_at: z.coerce.date().nullable(),
  meeting_link_token: z.string(),
  status: MeetingStatusSchema,
  recording_enabled: z.boolean().default(false),
  livekit_room_name: z.string(),
  lobby_enabled: z.boolean().default(false),
  locked: z.boolean().default(false),
  created_at: z.coerce.date(),
});
export type Meeting = z.infer<typeof MeetingSchema>;

export const MeetingCreateInputSchema = MeetingSchema.omit({
  id: true,
  created_at: true,
  description: true,
  scheduled_at: true,
  started_at: true,
  ended_at: true,
}).extend({
  description: z.string().nullable().optional(),
  scheduled_at: z.coerce.date().nullable().optional(),
  started_at: z.coerce.date().nullable().optional(),
  ended_at: z.coerce.date().nullable().optional(),
});
export type MeetingCreateInput = z.infer<typeof MeetingCreateInputSchema>;

export const MeetingUpdateInputSchema = MeetingCreateInputSchema.partial();
export type MeetingUpdateInput = z.infer<typeof MeetingUpdateInputSchema>;
