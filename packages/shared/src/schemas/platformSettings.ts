import { z } from 'zod';

export const PlatformSettingsSchema = z.object({
  // Singleton primary key — fixed to "singleton" by the platformSettings row;
  // do not enforce cuid format here.
  id: z.string().min(1),
  free_tier_group_call_limit_minutes: z.number().int().default(45),
  free_tier_max_participants: z.number().int().default(8),
  pro_tier_price_cents: z.number().int().default(299900),
  enterprise_tier_price_cents: z.number().int().default(849900),
  recording_storage_quota_gb: z.number().int(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type PlatformSettings = z.infer<typeof PlatformSettingsSchema>;

export const PlatformSettingsCreateInputSchema = PlatformSettingsSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type PlatformSettingsCreateInput = z.infer<typeof PlatformSettingsCreateInputSchema>;

export const PlatformSettingsUpdateInputSchema = PlatformSettingsCreateInputSchema.partial();
export type PlatformSettingsUpdateInput = z.infer<typeof PlatformSettingsUpdateInputSchema>;
