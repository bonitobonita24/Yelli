"use client";

/**
 * Past-due grace banner. Renders a destructive Alert at the top of the
 * authenticated app shell when the caller org's subscription is mid-grace
 * (status === 'past_due' with a grace_period_end deadline set by the
 * Xendit webhook on invoice.expired — Phase 8 Item 3 sub-session 3c-ii-b).
 *
 * Mount: app shell layouts (/admin/layout.tsx + /app/layout.tsx) — NOT
 * page-level, because the grace banner must be impossible to miss across
 * the entire authenticated surface (departure from PlanLimitBanner which
 * is per-page mounted because it's feature-gated).
 *
 * Data source: trpc.billing.subscription.current — adminProcedure-gated.
 * Non-admin users on /app/* get a silent 403 and the banner renders null
 * (matches PlanLimitBanner's silent-degrade pattern on the same surface).
 * The cron worker (grace-sweeper) is the authoritative kill-switch — this
 * banner is purely informational and CANNOT prevent suspension.
 */

import { Alert, AlertDescription, AlertTitle } from "@yelli/ui/alert";
import { Button } from "@yelli/ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { computePastDueBannerState } from "@/lib/billing/past-due-banner-state";
import { trpc } from "@/lib/trpc/react";

export function PastDueBanner(): JSX.Element | null {
  const query = trpc.billing.subscription.current.useQuery(undefined, {
    // Non-admin users get FORBIDDEN — don't retry, don't refetch.
    retry: false,
  });

  if (!query.data) return null;
  const state = computePastDueBannerState({
    status: query.data.status,
    grace_period_end: query.data.grace_period_end,
  });
  if (!state) return null;

  return (
    <Alert
      variant="destructive"
      className="mb-4 flex items-start justify-between gap-4"
      role="alert"
    >
      <div className="flex-1">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Payment past due</AlertTitle>
        <AlertDescription>
          Your last payment failed. Update billing now to keep your team&apos;s
          calls active. Your account will be suspended on{" "}
          <strong>{state.formattedDeadline}</strong>.
        </AlertDescription>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/admin/billing">Update billing</Link>
      </Button>
    </Alert>
  );
}
