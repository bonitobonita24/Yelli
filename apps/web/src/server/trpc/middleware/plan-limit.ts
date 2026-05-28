import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { hasCapability, isAtNumericLimit } from "@yelli/shared";

import type { MiddlewareResult } from "@trpc/server/unstable-core-do-not-import";
import type { BooleanPlanFeature, NumericPlanFeature } from "@yelli/shared";

/**
 * Plain async middleware functions (not wrapped in tRPC's `middleware()` builder)
 * so they remain unit-testable in isolation. tRPC's `.use()` accepts both built
 * middleware objects and plain async functions with the `({ ctx, next })` shape
 * (see apps/web/src/server/trpc/trpc.ts:48-87 — adminProcedure uses inline async
 * functions identically). Composing with adminProcedure/protectedProcedure
 * preserves narrowed ctx because tRPC's type inference flows through `.use()`.
 *
 * `next` is typed as returning `Promise<MiddlewareResult<unknown>>` so callers
 * can pass the function directly to `.use()` without casts — tRPC's `.use()`
 * accepts any function whose `next()` return type is assignable to MiddlewareResult.
 */

type MiddlewareOpts = {
  ctx: unknown;
  next: () => Promise<MiddlewareResult<unknown>>;
};

export function enforceNumericPlanLimit(
  feature: NumericPlanFeature,
  getCurrentUsage: () => Promise<number>,
) {
  return async ({ ctx, next }: MiddlewareOpts) => {
    const organizationId = (ctx as { organizationId?: string }).organizationId;
    if (!organizationId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Organization context required.",
      });
    }
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan_tier: true },
    });
    if (!org) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Organization not found.",
      });
    }
    const currentUsage = await getCurrentUsage();
    if (isAtNumericLimit(org.plan_tier, feature, currentUsage)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Plan limit reached for ${feature}.`,
      });
    }
    return next();
  };
}

export function requirePlanCapability(feature: BooleanPlanFeature) {
  return async ({ ctx, next }: MiddlewareOpts) => {
    const organizationId = (ctx as { organizationId?: string }).organizationId;
    if (!organizationId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Organization context required.",
      });
    }
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan_tier: true },
    });
    if (!org) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Organization not found.",
      });
    }
    if (!hasCapability(org.plan_tier, feature)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Feature '${feature}' requires a higher plan.`,
      });
    }
    return next();
  };
}

/**
 * Inline-in-handler variants — for cases where the cap check depends on
 * input (e.g. only enforce auto-answer cap when input flips it on) or must
 * happen inside a Prisma $transaction so the usage count and write are
 * consistent. Routers call these after computing `currentUsage` from a
 * tx-scoped count(). The org plan_tier lookup uses the non-tx prisma client
 * — plan_tier is rarely mutated and not within create paths, so a tx-local
 * view is not required.
 */
export async function assertNumericPlanLimit(
  organizationId: string,
  feature: NumericPlanFeature,
  currentUsage: number,
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan_tier: true },
  });
  if (!org) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Organization not found.",
    });
  }
  if (isAtNumericLimit(org.plan_tier, feature, currentUsage)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Plan limit reached for ${feature}.`,
    });
  }
}

export async function assertPlanCapability(
  organizationId: string,
  feature: BooleanPlanFeature,
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan_tier: true },
  });
  if (!org) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Organization not found.",
    });
  }
  if (!hasCapability(org.plan_tier, feature)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Feature '${feature}' requires a higher plan.`,
    });
  }
}
