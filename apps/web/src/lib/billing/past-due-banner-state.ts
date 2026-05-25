/**
 * Pure decision logic for the past-due grace banner — extracted so the
 * status/deadline gating can be unit-tested under the project's `node`
 * Vitest environment without bolting on jsdom + RTL just for one banner.
 *
 * Mirrors the compute-banner-state.ts pattern from PlanLimitBanner.
 *
 * Source-of-truth alignment: the banner is the user-facing surface for the
 * grace period state machine introduced in Phase 8 Item 3 sub-session
 * 3c-ii-b (packages/jobs/src/workers/grace-sweeper.ts +
 * packages/jobs/src/workers/xendit-webhook.ts handleInvoiceExpired).
 * Webhook sets grace_period_end on invoice.expired; cron flips to
 * 'suspended' when the deadline passes. This banner only renders during
 * the past_due → suspended window — never before, never after.
 */

/**
 * Mirror of the Prisma SubscriptionStatus enum
 * (packages/db/prisma/schema.prisma). Defined locally to avoid importing
 * @yelli/db into client-reachable code (Rule 13). Keep in sync with the
 * schema on enum changes — there is no shared source-of-truth helper.
 */
type SubscriptionStatus =
  | "active"
  | "past_due"
  | "cancelled"
  | "trialing"
  | "suspended";

export interface PastDueBannerInput {
  status: SubscriptionStatus;
  grace_period_end: Date | null;
}

export interface PastDueBannerState {
  /** Localised deadline string for the "suspended on {date}" copy. */
  formattedDeadline: string;
}

/**
 * Returns banner state when the caller's subscription is mid-grace, or
 * null when the banner should not render.
 *
 * Renders only when status is exactly 'past_due' AND grace_period_end is
 * set. Any other status (active, suspended, cancelled) returns null —
 * a suspended account has already passed the deadline and is surfaced via
 * a different UX on /admin/billing.
 */
export function computePastDueBannerState(
  input: PastDueBannerInput,
): PastDueBannerState | null {
  if (input.status !== "past_due") return null;
  if (!input.grace_period_end) return null;
  return {
    formattedDeadline: input.grace_period_end.toLocaleDateString(),
  };
}
