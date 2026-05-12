import { z } from 'zod';

import { PlanTierSchema, SubscriptionStatusSchema } from './organization.js';

export const SubscriptionSchema = z.object({
  id: z.string().cuid2(),
  organization_id: z.string().cuid2(),
  plan_tier: PlanTierSchema,
  xendit_subscription_id: z.string().nullable(),
  payment_method: z.string().nullable(),
  status: SubscriptionStatusSchema,
  current_period_start: z.coerce.date(),
  current_period_end: z.coerce.date(),
  minutes_used_this_period: z.number().int().default(0),
  recording_minutes_used_this_period: z.number().int().default(0),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const SubscriptionCreateInputSchema = SubscriptionSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type SubscriptionCreateInput = z.infer<typeof SubscriptionCreateInputSchema>;

export const SubscriptionUpdateInputSchema = SubscriptionCreateInputSchema.partial();
export type SubscriptionUpdateInput = z.infer<typeof SubscriptionUpdateInputSchema>;
