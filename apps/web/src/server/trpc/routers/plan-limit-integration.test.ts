/**
 * Phase 8 Item 2a-ii — integration coverage for plan-tier enforcement.
 *
 * Exercises the new at-cap rejection paths in:
 *   - departments.create        (departments cap + autoAnswerStations cap)
 *   - departments.update        (autoAnswerStations cap on flip false→true)
 *   - admin.users.invite        (users cap + admins sub-cap)
 *   - billing.usage.current     (response shape)
 *
 * Lives separate from the existing router test files because each of those
 * predates plan-limit gating and stubs only the prisma calls those tests
 * actually exercised. Bolting new mock surface area onto them would risk
 * silent regressions; a fresh file with focused mocks keeps both green.
 */

import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminRouter } from "@/server/trpc/routers/admin";
import { billingRouter } from "@/server/trpc/routers/billing";
import { departmentsRouter } from "@/server/trpc/routers/departments";
import { createCallerFactory } from "@/server/trpc/trpc";

vi.mock("@yelli/db", () => {
  const txDepartment = {
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const txUser = {
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  };
  return {
    prisma: {
      organization: { findUnique: vi.fn() },
      department: { count: vi.fn(), findUnique: vi.fn() },
      user: { count: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
        cb({
          department: txDepartment,
          user: txUser,
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

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-temp-password"),
  },
}));

const ADMIN_SESSION = {
  id: "user-admin-cuid",
  email: "admin@example.com",
  name: "Admin User",
  displayName: "Admin User",
  organizationId: "org-tenant-cuid",
  organizationSlug: "tenant-org",
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

const callDepartments = createCallerFactory(departmentsRouter);
const callAdmin = createCallerFactory(adminRouter);
const callBilling = createCallerFactory(billingRouter);

const mockOrg = (planTier: "free" | "pro" | "enterprise") =>
  vi
    .mocked(prisma.organization.findUnique)
    // Cast through unknown — the select clauses in production only read
    // `plan_tier`, so a minimal partial is sufficient. Prisma's strict
    // generated typing would otherwise require the full row.
    .mockResolvedValue(
      { plan_tier: planTier } as unknown as Awaited<
        ReturnType<typeof prisma.organization.findUnique>
      >,
    );

// Prisma's $transaction signature is strict (callback typed to the full
// extended Prisma client). The vi.mock factory above replaces it with a
// loose passthrough, but TS still types `mockImplementationOnce` against
// the original. Cast through an opaque mock shape so per-test overrides
// can pass a minimal tx surface without fighting Prisma's generated types.
type LooseTxMock = {
  mockImplementationOnce: (impl: (cb: (tx: unknown) => unknown) => unknown) => unknown;
};
const txMock = prisma.$transaction as unknown as LooseTxMock;

/**
 * The departmentsRouter create/update mutations resolve count() / create()
 * via the tx callback. The $transaction mock invokes the callback with its
 * own tx object — we wire fresh fakes per test so each scenario controls
 * the count that drives the plan-limit decision.
 */
function mockDepartmentsTx(setup: {
  departmentCount?: number;
  autoAnswerCount?: number;
  existingDept?: {
    id: string;
    name: string;
    auto_answer_enabled: boolean;
  } | null;
  createResult?: { id: string; name: string };
  updateResult?: { id: string; name: string };
}) {
  const counts: number[] = [];
  if (setup.departmentCount !== undefined) counts.push(setup.departmentCount);
  if (setup.autoAnswerCount !== undefined) counts.push(setup.autoAnswerCount);

  txMock.mockImplementationOnce(
    (cb: (tx: unknown) => unknown) =>
      cb({
        department: {
          count: vi.fn(async () => counts.shift() ?? 0),
          findUnique: vi.fn(async () => setup.existingDept ?? null),
          create: vi.fn(
            async () => setup.createResult ?? { id: "new-id", name: "n" },
          ),
          update: vi.fn(
            async () => setup.updateResult ?? { id: "x", name: "x" },
          ),
        },
      }) as unknown,
  );
}

function mockUsersTx(setup: {
  existingUser?: { id: string } | null;
  userCount?: number;
  adminCount?: number;
  createResult?: {
    id: string;
    email: string;
    display_name: string;
    role: "tenant_admin" | "host" | "participant";
  };
}) {
  const userCounts: number[] = [];
  if (setup.userCount !== undefined) userCounts.push(setup.userCount);
  if (setup.adminCount !== undefined) userCounts.push(setup.adminCount);

  txMock.mockImplementationOnce(
    (cb: (tx: unknown) => unknown) =>
      cb({
        user: {
          findFirst: vi.fn(async () => setup.existingUser ?? null),
          count: vi.fn(async () => userCounts.shift() ?? 0),
          create: vi.fn(
            async () =>
              setup.createResult ?? {
                id: "new-user-id",
                email: "x@y.com",
                display_name: "x",
                role: "participant",
              },
          ),
        },
      }) as unknown,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("departments.create — plan-limit enforcement", () => {
  it("rejects with FORBIDDEN when free org is at the 5-department cap", async () => {
    mockOrg("free");
    mockDepartmentsTx({ departmentCount: 5 });

    const caller = callDepartments(makeCtx());
    await expect(
      caller.create({ name: "Sixth Dept" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows creation when free org has 4 departments (below the 5 cap)", async () => {
    mockOrg("free");
    mockDepartmentsTx({
      departmentCount: 4,
      createResult: { id: "new-dept-id", name: "Fifth Dept" },
    });

    const caller = callDepartments(makeCtx());
    const result = await caller.create({ name: "Fifth Dept" });
    expect(result).toEqual({ id: "new-dept-id", name: "Fifth Dept" });
  });

  it("allows creation on enterprise tier even at 9999 departments (Infinity cap)", async () => {
    mockOrg("enterprise");
    mockDepartmentsTx({
      departmentCount: 9999,
      createResult: { id: "id", name: "n" },
    });

    const caller = callDepartments(makeCtx());
    await expect(caller.create({ name: "n" })).resolves.toBeDefined();
  });

  it("rejects when creating with auto_answer=true and station cap is hit", async () => {
    mockOrg("free");
    mockDepartmentsTx({ departmentCount: 1, autoAnswerCount: 2 });

    const caller = callDepartments(makeCtx());
    await expect(
      caller.create({ name: "Station 3", auto_answer_enabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows creating an auto-answer station when below the station cap", async () => {
    mockOrg("pro");
    mockDepartmentsTx({
      departmentCount: 1,
      autoAnswerCount: 5,
      createResult: { id: "new", name: "Station 6" },
    });

    const caller = callDepartments(makeCtx());
    await expect(
      caller.create({ name: "Station 6", auto_answer_enabled: true }),
    ).resolves.toEqual({ id: "new", name: "Station 6" });
  });
});

describe("departments.update — auto-answer flip plan-limit", () => {
  it("rejects flip false→true when free org is at the 2-station cap", async () => {
    mockOrg("free");
    mockDepartmentsTx({
      autoAnswerCount: 2,
      existingDept: {
        id: "clh3z8t3d0000qzpqfakedept",
        name: "Reception",
        auto_answer_enabled: false,
      },
    });

    const caller = callDepartments(makeCtx());
    await expect(
      caller.update({
        id: "clh3z8t3d0000qzpqfakedept",
        data: { auto_answer_enabled: true },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows no-op flip (already true) without consulting the station count", async () => {
    mockOrg("free");
    mockDepartmentsTx({
      existingDept: {
        id: "clh3z8t3d0000qzpqfakedept",
        name: "Reception",
        auto_answer_enabled: true,
      },
      updateResult: { id: "clh3z8t3d0000qzpqfakedept", name: "Reception" },
    });

    const caller = callDepartments(makeCtx());
    await expect(
      caller.update({
        id: "clh3z8t3d0000qzpqfakedept",
        data: { auto_answer_enabled: true },
      }),
    ).resolves.toBeDefined();
  });

  it("allows flip true→false regardless of cap", async () => {
    mockOrg("free");
    mockDepartmentsTx({
      existingDept: {
        id: "clh3z8t3d0000qzpqfakedept",
        name: "Reception",
        auto_answer_enabled: true,
      },
      updateResult: { id: "clh3z8t3d0000qzpqfakedept", name: "Reception" },
    });

    const caller = callDepartments(makeCtx());
    await expect(
      caller.update({
        id: "clh3z8t3d0000qzpqfakedept",
        data: { auto_answer_enabled: false },
      }),
    ).resolves.toBeDefined();
  });
});

describe("admin.users.invite — plan-limit enforcement", () => {
  it("rejects with FORBIDDEN when free org is at the 10-user cap", async () => {
    mockOrg("free");
    mockUsersTx({ userCount: 10 });

    const caller = callAdmin(makeCtx());
    await expect(
      caller.users.invite({
        email: "newbie@example.com",
        display_name: "Newbie",
        role: "participant",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when inviting a tenant_admin and admin sub-cap is hit (free=1)", async () => {
    mockOrg("free");
    mockUsersTx({ userCount: 3, adminCount: 1 });

    const caller = callAdmin(makeCtx());
    await expect(
      caller.users.invite({
        email: "second-admin@example.com",
        display_name: "Second Admin",
        role: "tenant_admin",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows tenant_admin invite when below both user and admin caps (pro)", async () => {
    mockOrg("pro");
    mockUsersTx({
      userCount: 5,
      adminCount: 1,
      createResult: {
        id: "new-admin-id",
        email: "second@example.com",
        display_name: "Second Admin",
        role: "tenant_admin",
      },
    });

    const caller = callAdmin(makeCtx());
    const result = await caller.users.invite({
      email: "second@example.com",
      display_name: "Second Admin",
      role: "tenant_admin",
    });
    expect(result.role).toBe("tenant_admin");
    expect(result.temp_password).toBeTruthy();
  });

  it("skips the admin sub-cap when inviting a participant", async () => {
    mockOrg("free");
    // Only userCount is consumed (1 count call) when role is not tenant_admin.
    mockUsersTx({
      userCount: 3,
      createResult: {
        id: "p-id",
        email: "p@example.com",
        display_name: "P",
        role: "participant",
      },
    });

    const caller = callAdmin(makeCtx());
    await expect(
      caller.users.invite({
        email: "p@example.com",
        display_name: "P",
        role: "participant",
      }),
    ).resolves.toMatchObject({ role: "participant" });
  });
});

describe("billing.usage.current — response shape for UI", () => {
  it("returns plan_tier + limits matrix + current usage counts", async () => {
    mockOrg("pro");
    vi.mocked(prisma.user.count)
      .mockResolvedValueOnce(12) // total users
      .mockResolvedValueOnce(2); // tenant_admins
    vi.mocked(prisma.department.count)
      .mockResolvedValueOnce(7) // total departments
      .mockResolvedValueOnce(3); // auto-answer stations

    const caller = callBilling(makeCtx());
    const result = await caller.usage.current();

    expect(result.plan_tier).toBe("pro");
    expect(result.usage).toEqual({
      users: 12,
      admins: 2,
      departments: 7,
      autoAnswerStations: 3,
    });
    // Limits matrix flows through verbatim — Pro caps from PLAN_LIMITS.
    expect(result.limits.users).toBe(50);
    expect(result.limits.departments).toBe(25);
    expect(result.limits.autoAnswerStations).toBe(10);
    expect(result.limits.whiteLabel).toBe(false);
  });

  it("throws NOT_FOUND when organization is missing", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);

    const caller = callBilling(makeCtx());
    await expect(caller.usage.current()).rejects.toThrow(TRPCError);
  });
});
