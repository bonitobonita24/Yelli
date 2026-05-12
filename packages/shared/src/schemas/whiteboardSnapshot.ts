import { z } from 'zod';

export const WhiteboardSnapshotSchema = z.object({
  id: z.string().cuid2(),
  meeting_id: z.string().cuid2(),
  snapshot_data: z.unknown(),
  is_persisted: z.boolean(),
  created_at: z.coerce.date(),
});
export type WhiteboardSnapshot = z.infer<typeof WhiteboardSnapshotSchema>;

export const WhiteboardSnapshotCreateInputSchema = WhiteboardSnapshotSchema.omit({
  id: true,
  created_at: true,
});
export type WhiteboardSnapshotCreateInput = z.infer<typeof WhiteboardSnapshotCreateInputSchema>;

export const WhiteboardSnapshotUpdateInputSchema = WhiteboardSnapshotCreateInputSchema.partial();
export type WhiteboardSnapshotUpdateInput = z.infer<typeof WhiteboardSnapshotUpdateInputSchema>;
