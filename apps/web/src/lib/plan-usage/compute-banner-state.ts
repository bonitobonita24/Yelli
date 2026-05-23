/**
 * Pure helpers for the PlanLimitBanner — extracted so the threshold/copy
 * logic can be unit-tested under the project's `node` Vitest environment
 * without bolting on jsdom + Testing Library just for one component.
 *
 * Source-of-truth alignment: thresholds mirror PRODUCT.md L108 — "Usage
 * alerts: in-app notification when approaching plan limits (80% and 100%)".
 */

import type { NumericPlanFeature, PlanTier } from "@yelli/shared";

export type BannerSeverity = "warning" | "destructive";

/** 80% threshold from PRODUCT.md L108. */
export const WARNING_THRESHOLD = 0.8;

/**
 * Returns the banner severity for a given usage/cap pair.
 * `null` means "no banner" — either Infinity tier (unlimited) or below the
 * warning threshold.
 *
 * Math note: at-cap is `usage >= limit` (not `>`), so reaching exactly the
 * cap fires the destructive banner. This matches the backend rejection in
 * isAtNumericLimit (packages/shared/plan-limits.ts).
 */
export function getBannerSeverity(
  usage: number,
  limit: number,
): BannerSeverity | null {
  if (!Number.isFinite(limit)) return null;
  if (limit <= 0) return null; // capability-style feature; not numeric-banner relevant
  if (usage >= limit) return "destructive";
  if (usage / limit >= WARNING_THRESHOLD) return "warning";
  return null;
}

/**
 * Human-readable label for each numeric feature. Kept here (not in shared)
 * so that copy changes don't churn the SoT module. PRODUCT.md uses these
 * exact phrasings in the billing/admin UI; keep aligned on edit.
 */
export function formatFeatureLabel(feature: NumericPlanFeature): string {
  switch (feature) {
    case "users":
      return "Users";
    case "admins":
      return "Tenant Admins";
    case "departments":
      return "Departments";
    case "autoAnswerStations":
      return "Auto-Answer Stations";
    case "participantsPerCall":
      return "Participants per Call";
    case "callDurationMinutes":
      return "Group Call Duration";
    case "recordingHoursPerMonth":
      return "Recording Hours";
    case "chatRetentionDays":
      return "Chat History Retention";
  }
}

/**
 * Compose the banner copy. Two shapes:
 *   destructive → "Reception limit reached (5/5). Upgrade to add more."
 *   warning     → "Approaching Reception limit (4/5). Consider upgrading."
 *
 * The CTA wording matches PRODUCT.md L19-20 onboarding language so users
 * see consistent verbiage across the billing flow and the inline banner.
 */
export function formatUsageMessage(
  feature: NumericPlanFeature,
  usage: number,
  limit: number,
  severity: BannerSeverity,
): string {
  const label = formatFeatureLabel(feature);
  if (severity === "destructive") {
    return `${label} limit reached (${usage}/${limit}). Upgrade your plan to add more.`;
  }
  return `Approaching ${label} limit (${usage}/${limit}). Consider upgrading.`;
}

/**
 * Whether the current plan should ever show an upgrade CTA. Enterprise tier
 * has Infinity on every numeric feature, so the banner never renders — but
 * we still expose this so consumer pages can hide the upgrade link entirely
 * for enterprise users.
 */
export function canUpgrade(planTier: PlanTier): boolean {
  return planTier !== "enterprise";
}
