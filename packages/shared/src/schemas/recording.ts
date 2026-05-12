import { z } from 'zod';

export const StorageTypeSchema = z.enum(['local', 's3']);
export type StorageType = z.infer<typeof StorageTypeSchema>;

export const RecordingStatusSchema = z.enum(['processing', 'ready', 'failed', 'deleted']);
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;

export const RecordingSchema = z.object({
  id: z.string().cuid2(),
  organization_id: z.string().cuid2(),
  meeting_id: z.string().cuid2(),
  call_log_id: z.string().cuid2(),
  file_path: z.string().min(1),
  file_size_bytes: z.bigint(),
  duration_seconds: z.number().int(),
  storage_type: StorageTypeSchema,
  status: RecordingStatusSchema,
  recorded_by_user_id: z.string().cuid2(),
  created_at: z.coerce.date(),
  deleted_at: z.coerce.date().nullable(),
});
export type Recording = z.infer<typeof RecordingSchema>;

export const RecordingCreateInputSchema = RecordingSchema.omit({
  id: true,
  created_at: true,
  deleted_at: true,
}).extend({
  deleted_at: z.coerce.date().nullable().optional(),
});
export type RecordingCreateInput = z.infer<typeof RecordingCreateInputSchema>;

export const RecordingUpdateInputSchema = RecordingCreateInputSchema.partial();
export type RecordingUpdateInput = z.infer<typeof RecordingUpdateInputSchema>;
