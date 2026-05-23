"use client";

/**
 * Client-side hook wrapping the `billing.usage.current` tRPC query. Returns
 * the live plan/cap/usage triple plus a `getBannerProps` helper that
 * resolves the banner state for any numeric feature. Consumed by
 * <PlanLimitBanner /> and by page-level CTA gating (e.g. disabling "New
 * Department" when at cap).
 *
 * The 30-second staleTime on the TRPCReactProvider's QueryClient means most
 * navigation between gated pages reuses cached usage data; cache is
 * invalidated naturally on the same provider's queryClient after relevant
 * mutations (create department / invite user) succeed.
 */


import { trpc } from "@/lib/trpc/react";

import {
  formatUsageMessage,
  getBannerSeverity,
  type BannerSeverity,
} from "./compute-banner-state";

import type { NumericPlanFeature, PlanTier } from "@yelli/shared";

export interface PlanBannerProps {
  severity: BannerSeverity;
  message: string;
  planTier: PlanTier;
  usage: number;
  limit: number;
}

/** Returns banner props for the given feature, or `null` when no banner. */
export type GetBannerProps = (feature: NumericPlanFeature) => PlanBannerProps | null;

export function usePlanUsage() {
  const query = trpc.billing.usage.current.useQuery();

  const getBannerProps: GetBannerProps = (feature) => {
    if (!query.data) return null;
    const limit = query.data.limits[feature];
    const usage = query.data.usage[feature as keyof typeof query.data.usage];
    // Some numeric features (participantsPerCall, callDurationMinutes,
    // recordingHoursPerMonth, chatRetentionDays) have no count surface in
    // the usage object — they're runtime caps, not at-rest counts. Skip.
    if (typeof usage !== "number") return null;
    const severity = getBannerSeverity(usage, limit);
    if (!severity) return null;
    return {
      severity,
      message: formatUsageMessage(feature, usage, limit, severity),
      planTier: query.data.plan_tier,
      usage,
      limit,
    };
  };

  /** Convenience: is the caller at-cap for `feature` (and so should CTA-disable)? */
  const isAtLimit = (feature: NumericPlanFeature): boolean => {
    const props = getBannerProps(feature);
    return props?.severity === "destructive";
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    getBannerProps,
    isAtLimit,
  };
}
