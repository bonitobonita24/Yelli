"use client";

/**
 * Inline plan-usage banner. Renders nothing below the 80% warning threshold,
 * a warning Alert from 80% to 99%, and a destructive Alert at 100%. The
 * destructive variant includes an upgrade CTA linking to /admin/billing.
 *
 * Backend assertNumericPlanLimit (apps/web/src/server/trpc/middleware/
 * plan-limit.ts) is the authoritative gate — this banner is purely
 * informational so users can see they're approaching a cap before a
 * mutation fails. A stale client cache cannot bypass enforcement.
 */

import { Alert, AlertDescription, AlertTitle } from "@yelli/ui/alert";
import { Button } from "@yelli/ui/button";
import { AlertTriangle, Ban } from "lucide-react";
import Link from "next/link";


import { canUpgrade } from "@/lib/plan-usage/compute-banner-state";
import { usePlanUsage } from "@/lib/plan-usage/use-plan-usage";

import type { NumericPlanFeature } from "@yelli/shared";

interface PlanLimitBannerProps {
  /** Numeric feature this banner watches. One banner per gated page. */
  feature: NumericPlanFeature;
  /** Optional override — defaults to "/admin/billing". */
  upgradeHref?: string;
}

export function PlanLimitBanner({
  feature,
  upgradeHref = "/admin/billing",
}: PlanLimitBannerProps): JSX.Element | null {
  const { getBannerProps } = usePlanUsage();
  const props = getBannerProps(feature);

  if (!props) return null;

  const Icon = props.severity === "destructive" ? Ban : AlertTriangle;
  const title =
    props.severity === "destructive" ? "Plan limit reached" : "Approaching plan limit";

  return (
    <Alert
      variant={props.severity}
      className="mb-4 flex items-start justify-between gap-4"
    >
      <div className="flex-1">
        <Icon className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{props.message}</AlertDescription>
      </div>
      {canUpgrade(props.planTier) ? (
        <Button asChild size="sm" variant="outline">
          <Link href={upgradeHref}>Upgrade plan</Link>
        </Button>
      ) : null}
    </Alert>
  );
}
