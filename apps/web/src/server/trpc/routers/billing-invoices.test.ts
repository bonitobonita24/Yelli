/**
 * Phase 8 Item 3 sub-session 3c-i — billing.invoices.list coverage.
 *
 * Distinct from billing-3a.test.ts (which covers upgrade/cancel/checkout) so
 * the invoice-list mock surface (a single prisma.invoice.findMany stub) does
 * not have to live alongside the heavier checkout fixtures.
 *
 * Four required cases per STATE.md 3c-i scope:
 *   1. empty state — list returns { items: [], nextCursor: null } when org has no invoices
 *   2. tenant isolation — findMany is always called with where.organization_id = ctx.organizationId
 *   3. xendit_invoice_id is NEVER in the wire shape (security.md prohibition 13 regression)
 *   4. pagination — limit and cursor both forwarded to Prisma correctly
 *
 * Mocking strategy mirrors billing-3a.test.ts:
 *   - vi.mock('@yelli/db') with stub prisma exposing only invoice.findMany + the
 *     subset of methods that adminProcedure middleware might touch indirectly.
 *   - vi.mock('@/server/lib/rate-limit') as no-op.
 *   - vi.mock('@/env') with XENDIT_SECRET_KEY set so the procedure-level early
 *     return (which list does NOT hit, but adminProcedure middleware does not
 *     care) stays consistent with sibling tests.
 *   - vi.mock('@/server/trpc/middleware/plan-limit') as no-op — invoice list
 *     does not gate on plan limits, but the adminProcedure passthrough still
 *     reaches into that module.
 */

import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { billingRouter } from "@/server/trpc/routers/billing";
import { createCallerFactory } from "@/server/trpc/trpc";

vi.mock("@yelli/db", () => ({
  prisma: {
    invoice: { findMany: vi.fn() },
    // Other models stubbed empty so adminProcedure middleware that indirectly
    // touches @yelli/db (e.g. for usage metrics) does not throw undefined-access.
    platformSettings: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  writeAuditLog: vi.fn(),
}));

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

vi.mock("@/server/trpc/middleware/plan-limit", () => ({
  enforceNumericPlanLimit: vi.fn(),
  requirePlanCapability: vi.fn(),
  assertNumericPlanLimit: vi.fn(),
  assertPlanCapability: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ORG_ID = "ckxxxxxxxxxxxxxxxxxxxxxxx";
const OTHER_ORG_ID = "ckzzzzzzzzzzzzzzzzzzzzzzz";
const USER_ID = "ckyyyyyyyyyyyyyyyyyyyyyyy";

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

beforeEach(() => {
  vi.clearAllMocks();
  envState.env.XENDIT_SECRET_KEY = "xnd_test_secret_key_for_unit_tests";
});

// ---------------------------------------------------------------------------
// billing.invoices.list
// ---------------------------------------------------------------------------

describe("billing.invoices.list (Phase 8 Item 3 sub-session 3c-i)", () => {
  it("returns empty items + nextCursor=null when the org has no invoices", async () => {
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const caller = callBilling(makeCtx());
    const result = await caller.invoices.list();
    expect(result).toEqual({ items: [], nextCursor: null });
    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
  });

  it("always scopes findMany to ctx.organizationId (tenant isolation regression)", async () => {
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const caller = callBilling(makeCtx());
    await caller.invoices.list();

    const findManyMock = prisma.invoice.findMany as ReturnType<typeof vi.fn>;
    const args = findManyMock.mock.calls[0]?.[0] as {
      where: { organization_id: string };
    };
    expect(args.where.organization_id).toBe(ORG_ID);
    // Belt-and-braces: confirm the OTHER org's id never appears anywhere in
    // the args — protects against a future bug where ctx.organizationId is
    // shadowed by an input field that defaults to a different org.
    expect(JSON.stringify(args)).not.toContain(OTHER_ORG_ID);
  });

  it("never returns xendit_invoice_id in the response shape (security.md prohibition 13)", async () => {
    // Even if Prisma somehow returns xendit_invoice_id, the select clause
    // controls the shape — so the test asserts BOTH the select is correct AND
    // the returned wire shape is free of the internal ID.
    const dbRows = [
      {
        id: "inv_1",
        amount_cents: 299900,
        currency: "PHP",
        status: "paid",
        issued_at: new Date("2026-05-01"),
        paid_at: new Date("2026-05-02"),
        pdf_url: "https://xendit.co/invoices/inv_1.pdf",
      },
      {
        id: "inv_2",
        amount_cents: 299900,
        currency: "PHP",
        status: "pending",
        issued_at: new Date("2026-05-15"),
        paid_at: null,
        pdf_url: null,
      },
    ];
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(dbRows);
    const caller = callBilling(makeCtx());
    const result = await caller.invoices.list();

    // Assertion 1: the select clause does NOT request xendit_invoice_id.
    const findManyMock = prisma.invoice.findMany as ReturnType<typeof vi.fn>;
    const args = findManyMock.mock.calls[0]?.[0] as {
      select: Record<string, true>;
    };
    expect(args.select).not.toHaveProperty("xendit_invoice_id");

    // Assertion 2: the response items never contain xendit_invoice_id, even
    // as undefined. Use Object.prototype.hasOwnProperty to make this airtight.
    for (const item of result.items) {
      expect(
        Object.prototype.hasOwnProperty.call(item, "xendit_invoice_id"),
      ).toBe(false);
    }
    expect(result.items).toHaveLength(2);
  });

  it("forwards pagination: defaults to take=21 (limit+1) and forwards cursor + skip when provided", async () => {
    // Round 1 — default limit (no input)
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const caller = callBilling(makeCtx());
    await caller.invoices.list();
    const findManyMock = prisma.invoice.findMany as ReturnType<typeof vi.fn>;
    const defaultArgs = findManyMock.mock.calls[0]?.[0] as {
      take: number;
      cursor?: unknown;
      skip?: number;
    };
    expect(defaultArgs.take).toBe(21); // limit (20) + 1 for nextCursor detection
    expect(defaultArgs.cursor).toBeUndefined();
    expect(defaultArgs.skip).toBeUndefined();

    // Round 2 — explicit limit + cursor (cursor must be a valid cuid per Zod schema)
    findManyMock.mockClear();
    findManyMock.mockResolvedValue([]);
    await caller.invoices.list({
      limit: 50,
      cursor: "ckaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const cursorArgs = findManyMock.mock.calls[0]?.[0] as {
      take: number;
      cursor: { id: string };
      skip: number;
    };
    expect(cursorArgs.take).toBe(51);
    expect(cursorArgs.cursor).toEqual({ id: "ckaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(cursorArgs.skip).toBe(1); // Prisma cursor pagination: skip self
  });

  it("returns nextCursor=<trailing.id> when results exceed limit, null otherwise", async () => {
    // Mock returns limit+1 rows (21 by default) — the procedure should pop the
    // trailing row and surface its id as nextCursor.
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `inv_${i.toString().padStart(2, "0")}`,
      amount_cents: 1000,
      currency: "PHP",
      status: "paid",
      issued_at: new Date(2026, 4, 21 - i),
      paid_at: new Date(2026, 4, 22 - i),
      pdf_url: null,
    }));
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
    const caller = callBilling(makeCtx());
    const result = await caller.invoices.list();
    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe("inv_20");
  });
});
