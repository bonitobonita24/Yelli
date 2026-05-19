import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminRouter } from "@/server/trpc/routers/admin";
import { createCallerFactory } from "@/server/trpc/trpc";

// vi.mock factories hoist above imports. The mocks below run before the
// adminRouter import resolves, so the router sees the mocked prisma.
vi.mock("@yelli/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    department: {
      count: vi.fn(),
    },
    callLog: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
      cb({
        user: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        organization: {
          findUnique: vi.fn(),
          update: vi.fn(),
        },
      }),
    ),
  },
  // Pass-through: skip the AsyncLocalStorage L6 plumbing in unit tests.
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

const createCaller = createCallerFactory(adminRouter);

const ORG_A = "clh3z8t3d0001qzpqorgaaaaaa";
const ORG_B = "clh3z8t3d0002qzpqorgbbbbbb";

// Augmented Auth.js Session shape (see apps/web/src/types/next-auth.d.ts).
const ADMIN_SESSION = {
  id: "clh3z8t3d0010qzpqadminaaa",
  email: "admin@a.example",
  name: "Admin A",
  displayName: "Admin A",
  organizationId: ORG_A,
  organizationSlug: "org-a",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

// Same admin but with the platform super-admin flag set — Task #21 regression
// scenario. The L6 extension previously bypassed tenant filtering for these
// users, leaking Org B data into Org A's admin UI.
const SUPER_ADMIN_SESSION = {
  ...ADMIN_SESSION,
  isSuperAdmin: true,
};

// Non-admin role used to verify the adminProcedure RBAC gate fires before
// any prisma method is touched.
const HOST_SESSION = {
  ...ADMIN_SESSION,
  id: "clh3z8t3d0011qzpqhostaaa",
  email: "host@a.example",
  role: "host" as const,
};

function makeCtx(
  session:
    | typeof ADMIN_SESSION
    | typeof SUPER_ADMIN_SESSION
    | typeof HOST_SESSION = ADMIN_SESSION,
) {
  return {
    session: { user: session, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/admin.users.list", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Task #21 — Cross-org tenant isolation on admin.* procedures
//
// Background: the L6 tenant-guard extension previously skipped tenant filtering
// when ALS context carried isSuperAdmin=true. A tenant_admin who also held the
// platform super_admin role would see EVERY org's users/departments/call_logs
// in their admin UI. The fix removes the L6 bypass AND adds explicit
// `where: { organization_id }` to every list/count/aggregate query as
// defense-in-depth. These tests guard both layers.
// =============================================================================

describe("admin.users.list — tenant isolation", () => {
  it("passes explicit organization_id where clause (regular tenant_admin)", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    const caller = createCaller(makeCtx());

    await caller.users.list();

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG_A },
      }),
    );
  });

  it("still passes explicit organization_id when caller is super-admin", async () => {
    // Regression guard: the L6 bypass on isSuperAdmin used to leak Org B
    // users into this list. Defense-in-depth ensures the where clause is
    // present regardless of the caller's platform role.
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    const caller = createCaller(makeCtx(SUPER_ADMIN_SESSION));

    await caller.users.list();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG_A },
      }),
    );
  });

  it("never queries with another org's id even if session is super-admin", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    const caller = createCaller(makeCtx(SUPER_ADMIN_SESSION));

    await caller.users.list();

    const call = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0];
    expect(call?.where).toEqual({ organization_id: ORG_A });
    expect(call?.where).not.toEqual({ organization_id: ORG_B });
    // Empty/undefined where would mean L6 alone is the barrier — exactly
    // the leak surface Task #21 closes.
    expect(call?.where).not.toBeUndefined();
  });
});

describe("admin.dashboard.stats — tenant isolation", () => {
  it("scopes every count and findMany to the caller's organization_id", async () => {
    vi.mocked(prisma.department.count).mockResolvedValue(0);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      plan_tier: "free",
      subscription_status: "trialing",
    } as never);
    vi.mocked(prisma.callLog.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx(SUPER_ADMIN_SESSION));
    await caller.dashboard.stats();

    expect(prisma.department.count).toHaveBeenCalledWith({
      where: { organization_id: ORG_A },
    });
    // user.count is called twice: total + active filter.
    expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
      where: { organization_id: ORG_A },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
      where: { organization_id: ORG_A, status: "active" },
    });
    expect(prisma.callLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_A }),
      }),
    );
  });
});

describe("admin.reports.exportCallLogsCsv — tenant isolation", () => {
  it("scopes the CSV export findMany to caller's organization_id", async () => {
    vi.mocked(prisma.callLog.findMany).mockResolvedValue([]);
    const caller = createCaller(makeCtx(SUPER_ADMIN_SESSION));

    await caller.reports.exportCallLogsCsv({
      start: new Date("2026-01-01T00:00:00Z"),
      end: new Date("2026-01-31T23:59:59Z"),
    });

    expect(prisma.callLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_A }),
      }),
    );
  });
});

describe("admin RBAC — non-admin sessions are rejected before any DB call", () => {
  it("rejects host role with FORBIDDEN and never touches prisma", async () => {
    const caller = createCaller(makeCtx(HOST_SESSION));

    await expect(caller.users.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
