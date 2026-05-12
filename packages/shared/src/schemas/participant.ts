import { z } from 'zod';

export const ParticipantRoleSchema = z.enum(['host', 'moderator', 'participant', 'guest']);
export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;

export const ParticipantSchema = z.object({
  id: z.string().cuid(),
  organization_id: z.string().cuid(),
  meeting_id: z.string().cuid(),
  user_id: z.string().cuid().nullable(),
  guest_display_name: z.string().nullable(),
  role_in_meeting: ParticipantRoleSchema,
  joined_at: z.coerce.date(),
  left_at: z.coerce.date().nullable(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const ParticipantCreateInputSchema = ParticipantSchema.omit({
  id: true,
});
export type ParticipantCreateInput = z.infer<typeof ParticipantCreateInputSchema>;

export const ParticipantUpdateInputSchema = ParticipantCreateInputSchema.partial();
export type ParticipantUpdateInput = z.infer<typeof ParticipantUpdateInputSchema>;
