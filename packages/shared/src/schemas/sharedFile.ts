import { z } from 'zod';

export const SharedFileSchema = z.object({
  id: z.string().cuid2(),
  meeting_id: z.string().cuid2(),
  uploaded_by_user_id: z.string().cuid2().nullable(),
  uploaded_by_guest_name: z.string().nullable(),
  file_name: z.string().min(1).max(500),
  file_path: z.string().min(1),
  file_size_bytes: z.bigint(),
  mime_type: z.string().min(1).max(255),
  is_persisted: z.boolean(),
  created_at: z.coerce.date(),
  expires_at: z.coerce.date().nullable(),
});
export type SharedFile = z.infer<typeof SharedFileSchema>;

export const SharedFileCreateInputSchema = SharedFileSchema.omit({
  id: true,
  created_at: true,
  expires_at: true,
}).extend({
  expires_at: z.coerce.date().nullable().optional(),
});
export type SharedFileCreateInput = z.infer<typeof SharedFileCreateInputSchema>;

export const SharedFileUpdateInputSchema = SharedFileCreateInputSchema.partial();
export type SharedFileUpdateInput = z.infer<typeof SharedFileUpdateInputSchema>;
