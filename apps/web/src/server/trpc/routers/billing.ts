import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import { z } from "zod";

import { env } from "@/env";
import { adminProcedure, router } from "@/server/trpc/trpc";

// ----------------------------------------------------------------------------
// Subscription sub-router
// ----------------------------------------------------------------------------

const subscriptionRouter = router({
  /**
   * Current subscription for the caller's org. Returns null if no active row
   * yet (free-tier orgs may not have a Subscription record until first upgrade).
   * L6 scopes by org automatically.
   */
  current: adminProcedure.query(async () => {
    const sub = await prisma.subscription.findFirst({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        plan_tier: true,
        status: true,
        current_period_start: true,
        current_period_end: true,
        payment_method: true,
        minutes_used_this_period: true,
        recording_minutes_used_this_period: true,
      },
    });
    return sub;
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
  list: adminProcedure
    .input(listInvoicesInput.optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const items = await prisma.invoice.findMany({
        take: limit + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { issued_at: "desc" },
        select: {
          id: true,
          xendit_invoice_id: true,
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

const checkoutInput = z
  .object({
    target_plan: z.enum(["pro", "enterprise"]),
  })
  .strict();

interface XenditInvoiceResponse {
  id: string;
  invoice_url: string;
  status: string;
  amount: number;
  currency: string;
}

const checkoutRouter = router({
  /**
   * Creates a Xendit Invoice checkout URL for the requested plan upgrade.
   *
   * Graceful degradation per STATE.md (parallels the LiveKit 503 pattern):
   * - If XENDIT_SECRET_KEY env is unset → throw SERVICE_UNAVAILABLE so the UI
   *   can render a "Billing is not configured" Alert instead of crashing.
   * - The Xendit Invoice API returns a hosted checkout URL; the user is
   *   redirected client-side. The actual subscription flip happens via the
   *   Xendit webhook handler (Phase 7 Feature Update).
   *
   * Pricing is read from PlatformSettings (singleton) so it can be updated by
   * super-admins without redeploying.
   */
  createSession: adminProcedure
    .input(checkoutInput)
    .mutation(async ({ ctx, input }) => {
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }

      const amount =
        input.target_plan === "pro"
          ? settings.pro_tier_price_cents
          : settings.enterprise_tier_price_cents;

      // Xendit Invoice API expects basic auth: base64(secret_key + ":")
      const authHeader = `Basic ${Buffer.from(`${env.XENDIT_SECRET_KEY}:`).toString(
        "base64",
      )}`;

      const xenditRes = await fetch("https://api.xendit.co/v2/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          // External ID is opaque to Xendit but lets us correlate webhooks → org
          external_id: `yelli-upgrade-${org.id}-${input.target_plan}-${Date.now()}`,
          amount: amount / 100,
          currency: "PHP",
          payer_email: org.billing_email,
          description: `Yelli ${input.target_plan} plan upgrade — ${org.name}`,
        }),
      });

      if (!xenditRes.ok) {
        // Never leak Xendit response body — could include internal IDs
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Payment provider rejected the request. Please try again.",
        });
      }

      const xenditData = (await xenditRes.json()) as XenditInvoiceResponse;

      await prisma.$transaction(async (tx) => {
        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "CREATE",
          entity: "Invoice",
          entityId: xenditData.id,
          before: null,
          after: {
            target_plan: input.target_plan,
            amount_cents: amount,
            xendit_invoice_id: xenditData.id,
          },
        });
      });

      return {
        invoice_url: xenditData.invoice_url,
        xendit_invoice_id: xenditData.id,
        amount_cents: amount,
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
});
