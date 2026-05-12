import { z } from 'zod';

export const PlanTierSchema = z.enum(['free', 'pro', 'enterprise']);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const SubscriptionStatusSchema = z.enum(['active', 'past_due', 'cancelled', 'trialing']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const OrganizationSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, hyphens only'),
  plan_tier: PlanTierSchema,
  subscription_status: SubscriptionStatusSchema,
  billing_email: z.string().email(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  suspended_at: z.coerce.date().nullable(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const OrganizationCreateInputSchema = OrganizationSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  suspended_at: true,
}).extend({
  suspended_at: z.coerce.date().nullable().optional(),
});
export type OrganizationCreateInput = z.infer<typeof OrganizationCreateInputSchema>;

export const OrganizationUpdateInputSchema = OrganizationCreateInputSchema.partial();
export type OrganizationUpdateInput = z.infer<typeof OrganizationUpdateInputSchema>;
