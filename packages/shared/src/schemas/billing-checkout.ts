import { z } from 'zod';

/**
 * Billing cycle for plan upgrades. PRODUCT.md L104:
 * "monthly or annual (annual = ~2 months free)". Annual is billed as a single
 * Xendit Invoice covering 12 months at 10× the monthly price; the effective
 * monthly rate quoted to the customer is monthly × 10 / 12.
 */
export const BillingCycleSchema = z.enum(['monthly', 'annual']);
export type BillingCycle = z.infer<typeof BillingCycleSchema>;

/**
 * Xendit Invoice API payment_methods codes (PH market). PRODUCT.md L105:
 * "card, GCash, Maya, GrabPay, BPI/BDO online banking via Xendit". Codes
 * match Xendit's documented Philippines method identifiers. Omitting
 * payment_methods on a Xendit Invoice request shows ALL available methods —
 * use the explicit list only when restricting choice.
 */
export const XenditPaymentMethodSchema = z.enum([
  'CREDIT_CARD',
  'GCASH',
  'PAYMAYA',
  'GRABPAY',
  'DD_BPI',
  'DD_BDO',
]);
export type XenditPaymentMethod = z.infer<typeof XenditPaymentMethodSchema>;

/**
 * Plan tiers eligible as an upgrade target. 'free' is excluded — there is no
 * checkout for downgrading to free; that path is either the grace-machine
 * auto-downgrade (Item 3c-ii) or an explicit subscription.cancel (no Xendit
 * interaction).
 */
export const UpgradeTargetPlanSchema = z.enum(['pro', 'enterprise']);
export type UpgradeTargetPlan = z.infer<typeof UpgradeTargetPlanSchema>;

/**
 * Input for billing.checkout.createSession — enriched in Phase 8 Item 3a.
 * billing_cycle defaults to monthly. payment_methods optional (Xendit shows
 * all when unset). Redirect URLs optional (Xendit defaults to its hosted
 * thank-you page); both validated as URLs to prevent open-redirect abuse
 * via the Xendit checkout flow.
 */
export const CheckoutSessionInputSchema = z
  .object({
    target_plan: UpgradeTargetPlanSchema,
    billing_cycle: BillingCycleSchema.default('monthly'),
    payment_methods: z.array(XenditPaymentMethodSchema).min(1).optional(),
    success_redirect_url: z.string().url().optional(),
    failure_redirect_url: z.string().url().optional(),
  })
  .strict();
export type CheckoutSessionInput = z.infer<typeof CheckoutSessionInputSchema>;

/**
 * Input for billing.subscription.upgrade — the verb-named entry point used by
 * the upgrade dialog (Item 3c-i). target_plan excludes 'free'. Returns the
 * Xendit checkout URL; actual Subscription row creation / status flip happens
 * in the webhook handler (Item 3b) AFTER Xendit confirms payment — never
 * trust client-side success.
 */
export const SubscriptionUpgradeInputSchema = z
  .object({
    target_plan: UpgradeTargetPlanSchema,
    billing_cycle: BillingCycleSchema.default('monthly'),
  })
  .strict();
export type SubscriptionUpgradeInput = z.infer<
  typeof SubscriptionUpgradeInputSchema
>;

/**
 * Input for billing.subscription.cancel — operates on caller's org's most
 * recent subscription. No params. Sets Subscription.status = 'cancelled' and
 * emits AuditLog. Does NOT immediately downgrade plan_tier — features remain
 * available until current_period_end. Auto-downgrade to free at period end
 * is the grace state machine's responsibility (Item 3c-ii).
 */
export const SubscriptionCancelInputSchema = z.object({}).strict();
export type SubscriptionCancelInput = z.infer<
  typeof SubscriptionCancelInputSchema
>;
