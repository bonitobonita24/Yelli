import { z } from 'zod';

export const CallTypeSchema = z.enum(['intercom', 'meeting']);
export type CallType = z.infer<typeof CallTypeSchema>;

export const CallStatusSchema = z.enum(['completed', 'missed', 'failed']);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const CallLogSchema = z.object({
  id: z.string().cuid2(),
  organization_id: z.string().cuid2(),
  meeting_id: z.string().cuid2().nullable(),
  caller_user_id: z.string().cuid2().nullable(),
  caller_department_id: z.string().cuid2().nullable(),
  recipient_department_id: z.string().cuid2().nullable(),
  call_type: CallTypeSchema,
  started_at: z.coerce.date(),
  ended_at: z.coerce.date().nullable(),
  // duration_seconds omitted — computed field
  participant_count: z.number().int().default(0),
  status: CallStatusSchema,
  created_at: z.coerce.date(),
});
export type CallLog = z.infer<typeof CallLogSchema>;

export const CallLogCreateInputSchema = CallLogSchema.omit({
  id: true,
  created_at: true,
  meeting_id: true,
  caller_user_id: true,
  caller_department_id: true,
  recipient_department_id: true,
  ended_at: true,
}).extend({
  meeting_id: z.string().cuid2().nullable().optional(),
  caller_user_id: z.string().cuid2().nullable().optional(),
  caller_department_id: z.string().cuid2().nullable().optional(),
  recipient_department_id: z.string().cuid2().nullable().optional(),
  ended_at: z.coerce.date().nullable().optional(),
});
export type CallLogCreateInput = z.infer<typeof CallLogCreateInputSchema>;

export const CallLogUpdateInputSchema = CallLogCreateInputSchema.partial();
export type CallLogUpdateInput = z.infer<typeof CallLogUpdateInputSchema>;
