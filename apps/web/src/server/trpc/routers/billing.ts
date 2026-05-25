import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import {
  CheckoutSessionInputSchema,
  PLAN_LIMITS,
  SubscriptionCancelInputSchema,
  SubscriptionUpgradeInputSchema,
  type XenditPaymentMethod,
} from "@yelli/shared";
import { z } from "zod";

import { env } from "@/env";
import { computeCycleAmount, createXenditInvoice } from "@/server/lib/xendit/client";
import { adminProcedure, router } from "@/server/trpc/trpc";

// ----------------------------------------------------------------------------
// Shared checkout helper — Phase 8 Item 3a
// Both billing.checkout.createSession (the original low-level entry point used
// by /admin/billing) and billing.subscription.upgrade (the verb-named entry
// point used by the upgrade dialog in 3c-i) call this. Centralising the env
// guard + pricing lookup + Xendit API call + AuditLog keeps the two procedures
// in lock-step and means a future hardening (e.g. webhook secret rotation,
// rate-limit override) only needs to land in one place.
// ----------------------------------------------------------------------------

interface CheckoutHelperParams {
  target_plan: "pro" | "enterprise";
  billing_cycle: "monthly" | "annual";
  payment_methods?: XenditPaymentMethod[] | undefined;
  success_redirect_url?: string | undefined;
  failure_redirect_url?: string | undefined;
}

async function createCheckoutInternal(
  ctx: { organizationId: string; userId: string },
  params: CheckoutHelperParams,
) {
  // Graceful degradation — parallels the LiveKit 503 pattern (env-empty in
  // dev/staging when XENDIT_SECRET_KEY hasn't been pulled from CREDENTIALS.md).
  if (!env.XENDIT_SECRET_KEY) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "Billing is not configured for this deployment. Contact your administrator.",
    });
  }

  const settings = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: {
      pro_tier_price_cents: true,
      enterprise_tier_price_cents: true,
    },
  });
  if (!settings) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Platform pricing not configured.",
    });
  }

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { id: true, name: true, billing_email: true },
  });
  if (!org) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Organization not found.",
    });
  }

  const monthlyAmountCents =
    params.target_plan === "pro"
      ? settings.pro_tier_price_cents
      : settings.enterprise_tier_price_cents;
  const amountCents = computeCycleAmount(monthlyAmountCents, params.billing_cycle);

  const xenditData = await createXenditInvoice(env.XENDIT_SECRET_KEY, {
    // External ID is opaque to Xendit but lets the webhook correlate back to
    // the org + plan + cycle without a DB round-trip on every callback.
    external_id: `yelli-upgrade-${org.id}-${params.target_plan}-${params.billing_cycle}-${Date.now()}`,
    amount: amountCents / 100,
    currency: "PHP",
    payer_email: org.billing_email,
    description: `Yelli ${params.target_plan} plan upgrade (${params.billing_cycle}) — ${org.name}`,
    payment_methods: params.payment_methods,
    success_redirect_url: params.success_redirect_url,
    failure_redirect_url: params.failure_redirect_url,
  });

  await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "CREATE",
      entity: "Invoice",
      entityId: xenditData.id,
      before: null,
      after: {
        target_plan: params.target_plan,
        billing_cycle: params.billing_cycle,
        amount_cents: amountCents,
        xendit_invoice_id: xenditData.id,
      },
    });
  });

  return {
    invoice_url: xenditData.invoice_url,
    xendit_invoice_id: xenditData.id,
    amount_cents: amountCents,
    billing_cycle: params.billing_cycle,
  };
}

// ----------------------------------------------------------------------------
// Subscription sub-router
// ----------------------------------------------------------------------------

const subscriptionRouter = router({
  /**
   * Current subscription for the caller's org. Returns null if no active row
   * yet (free-tier orgs may not have a Subscription record until first upgrade).
   * L6 scopes by org automatically.
   */
  current: adminProcedure.query(async ({ ctx }) => {
    // Defense-in-depth: explicit org filter alongside L6 auto-injection.
    // findFirst without a where would return ANY tenant's most recent
    // subscription if L6 ever regresses — exactly the leak Task #21 fixes.
    const sub = await prisma.subscription.findFirst({
      where: { organization_id: ctx.organizationId },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        plan_tier: true,
        status: true,
        current_period_start: true,
        current_period_end: true,
        // Surfaces the deadline behind the past-due grace banner
        // (Phase 8 Item 3 sub-session 3c-ii-a). Null for any
        // status !== 'past_due'.
        grace_period_end: true,
        payment_method: true,
        minutes_used_this_period: true,
        recording_minutes_used_this_period: true,
      },
    });
    return sub;
  }),

  /**
   * Phase 8 Item 3a — verb-named upgrade entry point used by the upgrade
   * dialog (Item 3c-i). Creates a Xendit Invoice for the requested plan +
   * billing_cycle and returns the hosted checkout URL.
   *
   * The actual Subscription row creation / flip to active happens in the
   * webhook handler (Item 3b) AFTER Xendit confirms payment — never trust
   * client-side success.
   *
   * Annual cycle = monthly × 10 (PRODUCT.md L104: ~2 months free).
   */
  upgrade: adminProcedure
    .input(SubscriptionUpgradeInputSchema)
    .mutation(async ({ ctx, input }) => {
      return createCheckoutInternal(ctx, {
        target_plan: input.target_plan,
        billing_cycle: input.billing_cycle,
      });
    }),

  /**
   * Phase 8 Item 3a — flips the caller org's most recent subscription to
   * 'cancelled'. Does NOT immediately downgrade plan_tier — features remain
   * available until current_period_end. Auto-downgrade to free at period end
   * is the Item 3c-ii grace state machine's responsibility.
   *
   * Idempotent: re-cancelling an already-cancelled subscription is a no-op
   * (returns ok=true, already_cancelled=true; no AuditLog spam).
   */
  cancel: adminProcedure
    .input(SubscriptionCancelInputSchema)
    .mutation(async ({ ctx }) => {
      const sub = await prisma.subscription.findFirst({
        where: { organization_id: ctx.organizationId },
        orderBy: { created_at: "desc" },
        select: { id: true, status: true, plan_tier: true },
      });
      if (!sub) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active subscription to cancel.",
        });
      }
      if (sub.status === "cancelled") {
        return { ok: true, already_cancelled: true };
      }

      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: "cancelled" },
        });
        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "Subscription",
          entityId: sub.id,
          before: { status: sub.status },
          after: { status: "cancelled" },
        });
      });

      return { ok: true, already_cancelled: false };
    }),
});

// ----------------------------------------------------------------------------
// Invoices sub-router
// ----------------------------------------------------------------------------

const listInvoicesInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().cuid().nullish(),
  })
  .strict();

const invoicesRouter = router({
  // security.md "AGENT PROHIBITIONS #13" — internal IDs (xendit_invoice_id) MUST NOT
  // appear in API responses to the client. They are server-only correlation keys.
  // The select below intentionally excludes xendit_invoice_id; webhook-worker.ts
  // and audit-log writers reference it internally but the wire shape never does.
  list: adminProcedure
    .input(listInvoicesInput.optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      // Defense-in-depth: explicit org filter on every invoice list.
      const items = await prisma.invoice.findMany({
        where: { organization_id: ctx.organizationId },
        take: limit + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { issued_at: "desc" },
        select: {
          id: true,
          amount_cents: true,
          currency: true,
          status: true,
          issued_at: true,
          paid_at: true,
          pdf_url: true,
        },
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const trailing = items.pop();
        nextCursor = trailing?.id ?? null;
      }

      return { items, nextCursor };
    }),
});

// ----------------------------------------------------------------------------
// Checkout sub-router — Xendit-backed with 503 graceful degradation
// ----------------------------------------------------------------------------

const checkoutRouter = router({
  /**
   * Creates a Xendit Invoice checkout URL for the requested plan upgrade.
   *
   * Pre-Item 3a this owned the inline Xendit fetch logic; Item 3a extracted
   * the env guard + pricing lookup + Xendit API call + AuditLog into
   * createCheckoutInternal so the new subscription.upgrade procedure (verb
   * naming, used by the upgrade dialog) can reuse them.
   *
   * Backwards compatible: the existing /admin/billing/page.tsx call
   * `checkout.createSession({ target_plan: 'pro' })` continues to work
   * because billing_cycle defaults to 'monthly' and the new optional fields
   * (payment_methods, redirect URLs) are undefined.
   */
  createSession: adminProcedure
    .input(CheckoutSessionInputSchema)
    .mutation(async ({ ctx, input }) => {
      return createCheckoutInternal(ctx, input);
    }),
});

// ----------------------------------------------------------------------------
// Usage query — read-side companion to plan-limit enforcement (Phase 8 Item 2)
// ----------------------------------------------------------------------------

/**
 * Returns the caller org's plan tier alongside the static cap matrix and the
 * current usage counts for every gated feature. Consumed by the UI (Speed Dial /
 * Departments / Users pages) to render proactive usage banners and disabled-CTA
 * states without waiting for a server-side rejection. The banner is purely
 * informational — backend mutations still re-check via assertNumericPlanLimit,
 * so a stale client cache can never bypass a cap.
 *
 * Defense-in-depth: explicit organization_id filter on every count even though
 * L6 auto-injection would already scope reads.
 */
const usageRouter = router({
  current: adminProcedure.query(async ({ ctx }) => {
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { plan_tier: true },
    });
    if (!org) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found.",
      });
    }

    const [userCount, adminCount, departmentCount, autoAnswerCount] =
      await Promise.all([
        prisma.user.count({
          where: { organization_id: ctx.organizationId },
        }),
        prisma.user.count({
          where: {
            organization_id: ctx.organizationId,
            role: "tenant_admin",
          },
        }),
        prisma.department.count({
          where: { organization_id: ctx.organizationId },
        }),
        prisma.department.count({
          where: {
            organization_id: ctx.organizationId,
            auto_answer_enabled: true,
          },
        }),
      ]);

    const limits = PLAN_LIMITS[org.plan_tier];

    return {
      plan_tier: org.plan_tier,
      limits,
      usage: {
        users: userCount,
        admins: adminCount,
        departments: departmentCount,
        autoAnswerStations: autoAnswerCount,
      },
    };
  }),
});

// ----------------------------------------------------------------------------
// Composed billing router
// ----------------------------------------------------------------------------

export const billingRouter = router({
  subscription: subscriptionRouter,
  invoices: invoicesRouter,
  checkout: checkoutRouter,
  usage: usageRouter,
});
