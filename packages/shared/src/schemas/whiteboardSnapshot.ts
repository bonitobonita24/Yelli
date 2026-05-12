import { z } from 'zod';

export const WhiteboardSnapshotSchema = z.object({
  id: z.string().cuid(),
  organization_id: z.string().cuid(),
  meeting_id: z.string().cuid(),
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
