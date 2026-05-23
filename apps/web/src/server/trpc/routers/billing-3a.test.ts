/**
 * Phase 8 Item 3a — Xendit checkout + subscription mutation coverage.
 *
 * Exercises the new procedures added in Item 3a:
 *   - billing.checkout.createSession  (enriched: billing_cycle, payment_methods, redirect URLs)
 *   - billing.subscription.upgrade    (verb-named entry point sharing internal helper)
 *   - billing.subscription.cancel     (status flip + AuditLog + idempotency)
 *
 * Lives separate from plan-limit-integration.test.ts (Item 2) because billing
 * is its own router with its own mock surface (Xendit fetch + platformSettings).
 *
 * Mocking strategy mirrors plan-limit-integration.test.ts: vi.mock '@yelli/db'
 * with stub prisma, vi.mock '@/server/lib/rate-limit' as a no-op. The env mock
 * uses vi.hoisted so individual tests can toggle XENDIT_SECRET_KEY without
 * disturbing the others (and without the TS readonly fight that direct
 * mutation triggers).
 */

import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { billingRouter } from "@/server/trpc/routers/billing";
import { createCallerFactory } from "@/server/trpc/trpc";

vi.mock("@yelli/db", () => {
  const txSubscription = {
    update: vi.fn(),
  };
  return {
    prisma: {
      platformSettings: { findUnique: vi.fn() },
      organization: { findUnique: vi.fn() },
      subscription: { findFirst: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
        cb({
          subscription: txSubscription,
        }),
      ),
    },
    runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
    writeAuditLog: vi.fn(),
  };
});

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    auth: { check: vi.fn() },
    api: { check: vi.fn() },
    public: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

const envState = vi.hoisted(() => ({
  env: {
    XENDIT_SECRET_KEY: "xnd_test_secret_key_for_unit_tests" as string | undefined,
  },
}));

vi.mock("@/env", () => envState);

// Plan-limit middleware reaches into @yelli/db; stub it lightly so any adminProcedure
// passthrough (which billing procedures use) does not trip undefined access.
vi.mock("@/server/trpc/middleware/plan-limit", () => ({
  enforceNumericPlanLimit: vi.fn(),
  requirePlanCapability: vi.fn(),
  assertNumericPlanLimit: vi.fn(),
  assertPlanCapability: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ORG_ID = "ckxxxxxxxxxxxxxxxxxxxxxxx"; // 25-char cuid format (z.string().cuid() compat)
const USER_ID = "ckyyyyyyyyyyyyyyyyyyyyyyy";

// Shape mirrors plan-limit-integration.test.ts ADMIN_SESSION (Item 2) — the
// adminProcedure middleware needs role/organizationId/isSuperAdmin/securityVersion
// to clear all gates; missing fields would surface as cryptic FORBIDDEN errors.
const ADMIN_SESSION = {
  id: USER_ID,
  email: "admin@test.org",
  name: "Test Admin",
  displayName: "Test Admin",
  organizationId: ORG_ID,
  organizationSlug: "test-org",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

function makeCtx() {
  return {
    session: { user: ADMIN_SESSION, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/test", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const callBilling = createCallerFactory(billingRouter);

const XENDIT_OK_RESPONSE = {
  id: "xnd-inv-test-123",
  invoice_url: "https://checkout.xendit.co/web/xnd-inv-test-123",
  status: "PENDING",
  amount: 2999,
  currency: "PHP",
  external_id: "yelli-upgrade-org-pro-monthly-1",
};

function stubCheckoutHappyPath() {
  (prisma.platformSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    pro_tier_price_cents: 299900,
    enterprise_tier_price_cents: 849900,
  });
  (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: ORG_ID,
    name: "Test Org",
    billing_email: "billing@test.org",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  envState.env.XENDIT_SECRET_KEY = "xnd_test_secret_key_for_unit_tests";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => XENDIT_OK_RESPONSE,
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// billing.checkout.createSession — enriched in 3a
// ---------------------------------------------------------------------------

describe("billing.checkout.createSession (Phase 8 Item 3a — enriched)", () => {
  it("forwards billing_cycle + payment_methods + redirect URLs to Xendit", async () => {
    stubCheckoutHappyPath();
    const caller = callBilling(makeCtx());
    await caller.checkout.createSession({
      target_plan: "pro",
      billing_cycle: "monthly",
      payment_methods: ["CREDIT_CARD", "GCASH"],
      success_redirect_url: "https://app.test/billing/success",
      failure_redirect_url: "https://app.test/billing/failure",
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.xendit.co/v2/invoices");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["payment_methods"]).toEqual(["CREDIT_CARD", "GCASH"]);
    expect(body["success_redirect_url"]).toBe("https://app.test/billing/success");
    expect(body["failure_redirect_url"]).toBe("https://app.test/billing/failure");
    expect(body["amount"]).toBe(2999); // 299900 cents / 100 = 2999 PHP (monthly)
    expect(body["currency"]).toBe("PHP");
    expect(body["description"]).toContain("(monthly)");
  });

  it("annual cycle bills 10× monthly (2 months free per PRODUCT.md L104)", async () => {
    stubCheckoutHappyPath();
    const caller = callBilling(makeCtx());
    const result = await caller.checkout.createSession({
      target_plan: "pro",
      billing_cycle: "annual",
    });
    expect(result.amount_cents).toBe(2999000); // 299900 × 10
    expect(result.billing_cycle).toBe("annual");
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body["amount"]).toBe(29990); // 2,999,000 cents / 100
    expect(body["description"]).toContain("(annual)");
  });

  it("monthly cycle is the default when billing_cycle is omitted", async () => {
    stubCheckoutHappyPath();
    const caller = callBilling(makeCtx());
    const result = await caller.checkout.createSession({ target_plan: "pro" });
    expect(result.billing_cycle).toBe("monthly");
    expect(result.amount_cents).toBe(299900);
  });

  it("returns SERVICE_UNAVAILABLE when XENDIT_SECRET_KEY is unset (graceful degradation)", async () => {
    stubCheckoutHappyPath();
    envState.env.XENDIT_SECRET_KEY = undefined;
    const caller = callBilling(makeCtx());
    await expect(
      caller.checkout.createSession({ target_plan: "pro" }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    // Critically, the Xendit API is NEVER called when env is unset.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects unknown target_plan via Zod schema (BAD_REQUEST)", async () => {
    stubCheckoutHappyPath();
    const caller = callBilling(makeCtx());
    await expect(
      // @ts-expect-error — 'platinum' is not in the UpgradeTargetPlanSchema enum
      caller.checkout.createSession({ target_plan: "platinum" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("AuditLog after-state includes billing_cycle (proves it's persisted, not just sent to Xendit)", async () => {
    stubCheckoutHappyPath();
    const caller = callBilling(makeCtx());
    await caller.checkout.createSession({
      target_plan: "enterprise",
      billing_cycle: "annual",
    });
    const auditCalls = (writeAuditLog as ReturnType<typeof vi.fn>).mock.calls;
    expect(auditCalls).toHaveLength(1);
    const [, payload] = auditCalls[0] as [
      unknown,
      { entity: string; after: Record<string, unknown> },
    ];
    expect(payload.entity).toBe("Invoice");
    expect(payload.after).toMatchObject({
      target_plan: "enterprise",
      billing_cycle: "annual",
      amount_cents: 8499000, // 849900 × 10 = ₱84,990 annual = ~₱7,083/mo effective (PRODUCT.md L104)
    });
  });

  it("returns BAD_GATEWAY when Xendit responds non-2xx (no internal-detail leak)", async () => {
    stubCheckoutHappyPath();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error_code: "INVALID_PAYMENT_METHOD",
          message: "internal detail that must not leak",
        }),
      })),
    );
    const caller = callBilling(makeCtx());
    await expect(
      caller.checkout.createSession({ target_plan: "pro" }),
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });
});

// ---------------------------------------------------------------------------
// billing.subscription.upgrade — new verb-named entry point
// ---------------------------------------------------------------------------

describe("billing.subscription.upgrade (Phase 8 Item 3a)", () => {
  it("creates a Xendit Invoice via the shared helper and returns checkout URL", async () => {
    stubCheckoutHappyPath();
    const caller = callBilling(makeCtx());
    const result = await caller.subscription.upgrade({
      target_plan: "pro",
      billing_cycle: "monthly",
    });
    expect(result.invoice_url).toBe(XENDIT_OK_RESPONSE.invoice_url);
    expect(result.xendit_invoice_id).toBe(XENDIT_OK_RESPONSE.id);
    expect(result.billing_cycle).toBe("monthly");
    expect(result.amount_cents).toBe(299900);
  });

  it("rejects 'free' as upgrade target via schema (BAD_REQUEST, no Xendit call)", async () => {
    stubCheckoutHappyPath();
    const caller = callBilling(makeCtx());
    await expect(
      // @ts-expect-error — 'free' is excluded from UpgradeTargetPlanSchema
      caller.subscription.upgrade({ target_plan: "free", billing_cycle: "monthly" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// billing.subscription.cancel — new mutation
// ---------------------------------------------------------------------------

describe("billing.subscription.cancel (Phase 8 Item 3a)", () => {
  it("flips active subscription to 'cancelled' and writes AuditLog", async () => {
    (prisma.subscription.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sub-abc",
      status: "active",
      plan_tier: "pro",
    });
    const caller = callBilling(makeCtx());
    const result = await caller.subscription.cancel({});
    expect(result).toEqual({ ok: true, already_cancelled: false });
    const auditCalls = (writeAuditLog as ReturnType<typeof vi.fn>).mock.calls;
    expect(auditCalls).toHaveLength(1);
    const [, payload] = auditCalls[0] as [
      unknown,
      {
        action: string;
        entity: string;
        entityId: string;
        before: { status: string };
        after: { status: string };
      },
    ];
    expect(payload).toMatchObject({
      action: "UPDATE",
      entity: "Subscription",
      entityId: "sub-abc",
      before: { status: "active" },
      after: { status: "cancelled" },
    });
  });

  it("returns NOT_FOUND when no subscription exists for the caller's org", async () => {
    (prisma.subscription.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const caller = callBilling(makeCtx());
    await expect(caller.subscription.cancel({})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("is idempotent on already-cancelled subscriptions (no AuditLog spam)", async () => {
    (prisma.subscription.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sub-abc",
      status: "cancelled",
      plan_tier: "pro",
    });
    const caller = callBilling(makeCtx());
    const result = await caller.subscription.cancel({});
    expect(result).toEqual({ ok: true, already_cancelled: true });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

// Defensive: importing TRPCError to anchor the type usage; otherwise the bundler
// might strip unused imports in some configurations and break the rejects.toThrow
// inference if we ever switch this file to .toThrow(TRPCError).
void TRPCError;
