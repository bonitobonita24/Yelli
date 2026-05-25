import { platformPrisma, writeAuditLog } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { superadminRouter } from "@/server/trpc/routers/superadmin";
import { createCallerFactory } from "@/server/trpc/trpc";

vi.mock("@yelli/db", () => ({
  platformPrisma: {
    invoice: { findMany: vi.fn() },
  },
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

const createCaller = createCallerFactory(superadminRouter);

const SUPER_ADMIN_SESSION = {
  id: "clh3z8t3d0099qzpqsuperaaaa",
  email: "platform@yelli.example",
  name: "Platform Admin",
  displayName: "Platform Admin",
  organizationId: "clh3z8t3d0001qzpqorgaaaaaa",
  organizationSlug: "platform-org",
  role: "tenant_admin" as const,
  isSuperAdmin: true,
  securityVersion: 1,
};

const TENANT_ADMIN_SESSION = {
  ...SUPER_ADMIN_SESSION,
  id: "clh3z8t3d0098qzpqtenantaaa",
  isSuperAdmin: false,
};

function makeCtx(session = SUPER_ADMIN_SESSION) {
  return {
    session: { user: session, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/superadmin.revenue.x", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const RANGE = {
  start: new Date("2026-01-01T00:00:00.000Z"),
  end: new Date("2026-01-31T23:59:59.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(platformPrisma.invoice.findMany).mockResolvedValue([] as never);
});

// ============================================================================
// RBAC — superAdminProcedure rejects non-super-admin sessions
// ============================================================================

describe("superadmin.revenue — RBAC", () => {
  it("rejects tenant_admin (isSuperAdmin=false) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ADMIN_SESSION));
    await expect(caller.revenue.exportRevenueCsv(RANGE)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(platformPrisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("rejects tenant_admin on PDF variant too", async () => {
    const caller = createCaller(makeCtx(TENANT_ADMIN_SESSION));
    await expect(caller.revenue.exportRevenuePdf(RANGE)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(platformPrisma.invoice.findMany).not.toHaveBeenCalled();
  });
});

// ============================================================================
// xendit_*_id leak regression — [[xendit-internal-id-in-api-wire]]
//
// The lesson from Phase 8 Item 3c-i: every tRPC select clause on a Prisma model
// that carries provider_*_id columns MUST explicitly enumerate the columns it
// returns. NEVER default-select-everything. Audit-grep rule:
//   grep -rn "xendit_.*_id" apps/web/src/server/trpc/routers/
// Every hit must be inside a `where` clause OR a regression test like this one.
// ============================================================================

describe("superadmin.revenue — xendit_*_id leak guard", () => {
  it("Prisma select on Invoice does NOT include xendit_invoice_id", async () => {
    const caller = createCaller(makeCtx());
    await caller.revenue.exportRevenueCsv(RANGE);

    expect(platformPrisma.invoice.findMany).toHaveBeenCalledTimes(1);
    const findManyArgs = vi.mocked(platformPrisma.invoice.findMany).mock.calls[0]?.[0];
    const select = (findManyArgs as { select: Record<string, unknown> })?.select;
    expect(select).toBeDefined();
    // Top-level Invoice select MUST NOT carry xendit_invoice_id
    expect(select).not.toHaveProperty("xendit_invoice_id");
    // Nested subscription select MUST NOT carry xendit_subscription_id
    const subSelect = (select.subscription as { select: Record<string, unknown> })
      .select;
    expect(subSelect).not.toHaveProperty("xendit_subscription_id");
    expect(subSelect).not.toHaveProperty("xendit_customer_id");
  });

  it("CSV output never contains 'xendit_' regardless of Prisma row shape", async () => {
    // Belt-and-braces: even if a future change accidentally widens the Prisma
    // select to carry xendit_invoice_id, the CSV serializer only emits
    // declared columns — so the string 'xendit_' must never appear.
    vi.mocked(platformPrisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        amount_cents: 299900,
        currency: "PHP",
        status: "paid",
        issued_at: new Date("2026-01-15T00:00:00.000Z"),
        subscription: { plan_tier: "pro", payment_method: "credit_card" },
        // Hostile field — should NEVER reach the CSV body.
        xendit_invoice_id: "xnd_invoice_LEAK_MARKER",
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.revenue.exportRevenueCsv(RANGE);

    expect(res.content).not.toContain("xendit_");
    expect(res.content).not.toContain("xnd_invoice_LEAK_MARKER");
  });

  it("PDF output never contains 'xendit_' in the raw byte stream", async () => {
    vi.mocked(platformPrisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        amount_cents: 299900,
        currency: "PHP",
        status: "paid",
        issued_at: new Date("2026-01-15T00:00:00.000Z"),
        subscription: { plan_tier: "pro", payment_method: "credit_card" },
        xendit_invoice_id: "xnd_invoice_LEAK_MARKER",
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.revenue.exportRevenuePdf(RANGE);
    const raw = Buffer.from(res.contentBase64, "base64").toString("binary");
    expect(raw).not.toContain("xnd_invoice_LEAK_MARKER");
  });
});

// ============================================================================
// Happy path — aggregation correctness
// ============================================================================

describe("superadmin.revenue — aggregation", () => {
  it("groups invoices by period_month + plan_tier + payment_method", async () => {
    vi.mocked(platformPrisma.invoice.findMany).mockResolvedValue([
      // Jan + pro + credit_card — 2 paid + 1 failed
      {
        id: "i1",
        amount_cents: 299900,
        currency: "PHP",
        status: "paid",
        issued_at: new Date("2026-01-05T00:00:00.000Z"),
        subscription: { plan_tier: "pro", payment_method: "credit_card" },
      },
      {
        id: "i2",
        amount_cents: 299900,
        currency: "PHP",
        status: "paid",
        issued_at: new Date("2026-01-20T00:00:00.000Z"),
        subscription: { plan_tier: "pro", payment_method: "credit_card" },
      },
      {
        id: "i3",
        amount_cents: 299900,
        currency: "PHP",
        status: "failed",
        issued_at: new Date("2026-01-25T00:00:00.000Z"),
        subscription: { plan_tier: "pro", payment_method: "credit_card" },
      },
      // Jan + enterprise + bank_transfer — 1 paid
      {
        id: "i4",
        amount_cents: 849900,
        currency: "PHP",
        status: "paid",
        issued_at: new Date("2026-01-12T00:00:00.000Z"),
        subscription: { plan_tier: "enterprise", payment_method: "bank_transfer" },
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.revenue.exportRevenueCsv(RANGE);
    const lines = res.content.split("\r\n").filter((l) => l.length > 0);
    // Header + 2 buckets (sorted: enterprise before pro alphabetically)
    expect(lines[0]).toBe(
      "period_month,plan_tier,payment_method,invoice_count,paid_count,failed_count,refunded_count,paid_amount_php",
    );
    expect(lines[1]).toBe("2026-01,enterprise,bank_transfer,1,1,0,0,8499");
    expect(lines[2]).toBe("2026-01,pro,credit_card,3,2,1,0,5998");
    expect(res.row_count).toBe(2);
  });

  it("writes a PLATFORM:EXPORT_REVENUE_CSV audit log on success", async () => {
    const caller = createCaller(makeCtx());
    await caller.revenue.exportRevenueCsv(RANGE);
    expect(writeAuditLog).toHaveBeenCalledWith(
      platformPrisma,
      expect.objectContaining({
        action: "PLATFORM:EXPORT_REVENUE_CSV",
        entity: "Invoice",
        organizationId: null,
        userId: SUPER_ADMIN_SESSION.id,
      }),
    );
  });

  it("writes a PLATFORM:EXPORT_REVENUE_PDF audit log on PDF export", async () => {
    const caller = createCaller(makeCtx());
    await caller.revenue.exportRevenuePdf(RANGE);
    expect(writeAuditLog).toHaveBeenCalledWith(
      platformPrisma,
      expect.objectContaining({
        action: "PLATFORM:EXPORT_REVENUE_PDF",
        entity: "Invoice",
      }),
    );
  });

  it("uses platformPrisma (cross-tenant) — no organization_id filter on the where clause", async () => {
    const caller = createCaller(makeCtx());
    await caller.revenue.exportRevenueCsv(RANGE);
    const args = vi.mocked(platformPrisma.invoice.findMany).mock.calls[0]?.[0];
    const where = (args as { where: Record<string, unknown> }).where;
    expect(where).not.toHaveProperty("organization_id");
    expect(where).toHaveProperty("issued_at");
  });
});

// ============================================================================
// Date range validation
// ============================================================================

describe("superadmin.revenue — date range validation", () => {
  it("rejects end <= start with BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.revenue.exportRevenueCsv({
        start: new Date("2026-02-01T00:00:00.000Z"),
        end: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(platformPrisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("rejects range > 366 days with BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.revenue.exportRevenueCsv({
        start: new Date("2025-01-01T00:00:00.000Z"),
        end: new Date("2026-06-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
