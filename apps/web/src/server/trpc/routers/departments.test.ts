import { prisma, writeAuditLog } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimiters } from "@/server/lib/rate-limit";
import { departmentsRouter } from "@/server/trpc/routers/departments";
import { createCallerFactory } from "@/server/trpc/trpc";

// vi.mock factories hoist above imports. The mocks below run before the
// imports above resolve, so the departmentsRouter we load sees the mocked
// prisma + runWithTenantContext + writeAuditLog.
vi.mock("@yelli/db", () => ({
  prisma: {
    department: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    // Pass-through: invoke the callback with the same prisma mock as tx.
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({
      department: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      user: { findUnique: vi.fn() },
    })),
  },
  // Pass-through: skip the AsyncLocalStorage L6 plumbing in tests.
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

const createCaller = createCallerFactory(departmentsRouter);

// Augmented Auth.js Session shape (see apps/web/src/types/next-auth.d.ts).
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

const HOST_SESSION = {
  ...ADMIN_SESSION,
  id: "user-host-cuid",
  email: "host@example.com",
  role: "host" as const,
};

function makeCtx(
  session: typeof ADMIN_SESSION | typeof HOST_SESSION = ADMIN_SESSION,
) {
  return {
    session: { user: session, expires: "2099-01-01" },
    req: new Request(
      "http://localhost/api/trpc/departments.setDefaultUser",
      {
        method: "POST",
        headers: { "x-forwarded-for": "127.0.0.1" },
      },
    ),
  };
}

const DEPT_FIXTURE = {
  id: "clh3z8t3d0000qzpqfakedept",
  name: "Reception",
  default_user_id: null as string | null,
};

const USER_FIXTURE = {
  id: "clh3z8t3d0001qzpqfakeuser",
  status: "active" as const,
};

// IMPORTANT: $transaction is mocked to invoke the callback with prisma itself
// (pass-through). We re-bind tx.department.findUnique / tx.user.findUnique to
// the top-level prisma mocks inside beforeEach so each test can assert on
// `vi.mocked(prisma.X.method)` directly rather than reaching into the tx mock.
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimiters.api.check).mockImplementation(() => {});

  // Wire $transaction to pass prisma straight through as tx.
  vi.mocked(prisma.$transaction).mockImplementation(
    ((cb: (tx: typeof prisma) => unknown) => cb(prisma)) as never,
  );
});

describe("departmentsRouter.setDefaultUser", () => {
  it("happy path: tenant_admin binds an active user → returns updated id + default_user_id, calls update", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(
      DEPT_FIXTURE as never,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER_FIXTURE as never);
    vi.mocked(prisma.department.update).mockResolvedValue({
      id: DEPT_FIXTURE.id,
      default_user_id: USER_FIXTURE.id,
    } as never);

    const caller = createCaller(makeCtx());
    const res = await caller.setDefaultUser({
      departmentId: DEPT_FIXTURE.id,
      userId: USER_FIXTURE.id,
    });

    expect(res).toEqual({
      id: DEPT_FIXTURE.id,
      default_user_id: USER_FIXTURE.id,
    });

    expect(prisma.department.update).toHaveBeenCalledTimes(1);
    const updateArg = vi.mocked(prisma.department.update).mock.calls[0]?.[0];
    expect(updateArg).toMatchObject({
      where: { id: DEPT_FIXTURE.id },
      data: { default_user_id: USER_FIXTURE.id },
    });
  });

  it("clear binding: userId: null sets default_user_id = null without looking up user", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({
      ...DEPT_FIXTURE,
      default_user_id: "clh3z8t3d0002qzpqpreviousx",
    } as never);
    vi.mocked(prisma.department.update).mockResolvedValue({
      id: DEPT_FIXTURE.id,
      default_user_id: null,
    } as never);

    const caller = createCaller(makeCtx());
    const res = await caller.setDefaultUser({
      departmentId: DEPT_FIXTURE.id,
      userId: null,
    });

    expect(res).toEqual({ id: DEPT_FIXTURE.id, default_user_id: null });

    // user.findUnique must NOT be called when clearing
    expect(prisma.user.findUnique).not.toHaveBeenCalled();

    expect(prisma.department.update).toHaveBeenCalledWith({
      where: { id: DEPT_FIXTURE.id },
      data: { default_user_id: null },
      select: { id: true, default_user_id: true },
    });
  });

  it("non-admin caller (role: host) → FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(HOST_SESSION));
    await expect(
      caller.setDefaultUser({
        departmentId: DEPT_FIXTURE.id,
        userId: USER_FIXTURE.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // adminProcedure must short-circuit BEFORE any DB call
    expect(prisma.department.findUnique).not.toHaveBeenCalled();
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("cross-org department (L6 returns null) → NOT_FOUND with generic message", async () => {
    // L6 tenant guard returns null for cross-org findUnique.
    vi.mocked(prisma.department.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setDefaultUser({
        departmentId: "clh3z8t3d0003qzpqotherorgz",
        userId: USER_FIXTURE.id,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Department not found.",
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("cross-org user (L6 returns null) → NOT_FOUND with generic message", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(
      DEPT_FIXTURE as never,
    );
    // L6 tenant guard returns null for cross-org user findUnique.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setDefaultUser({
        departmentId: DEPT_FIXTURE.id,
        userId: "clh3z8t3d0004qzpqotheruserx",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "User not found.",
    });

    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("inactive user → BAD_REQUEST with explicit message", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(
      DEPT_FIXTURE as never,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_FIXTURE.id,
      status: "inactive",
    } as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setDefaultUser({
        departmentId: DEPT_FIXTURE.id,
        userId: USER_FIXTURE.id,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Cannot bind an inactive user.",
    });

    expect(prisma.department.update).not.toHaveBeenCalled();
  });

});

describe("departmentsRouter.myBoundDepartmentIds (Phase 7 #16)", () => {
  it("returns an empty array when the caller is bound to no departments", async () => {
    vi.mocked(prisma.department.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.myBoundDepartmentIds();

    expect(res).toEqual([]);
  });

  it("returns ALL matching dept ids when the caller is bound to multiple departments", async () => {
    vi.mocked(prisma.department.findMany).mockResolvedValue([
      { id: "clh3z8t3d0010qzpqdeptaaaa" },
      { id: "clh3z8t3d0011qzpqdeptbbbb" },
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.myBoundDepartmentIds();

    expect(res).toEqual([
      "clh3z8t3d0010qzpqdeptaaaa",
      "clh3z8t3d0011qzpqdeptbbbb",
    ]);
  });

  it("queries findMany with where: { organization_id, default_user_id } and writes no audit log", async () => {
    vi.mocked(prisma.department.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    await caller.myBoundDepartmentIds();

    expect(prisma.department.findMany).toHaveBeenCalledTimes(1);
    // Task #21 defense-in-depth: explicit organization_id is now part of
    // every list query's where clause, alongside the user binding filter.
    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-tenant-cuid",
        default_user_id: "user-admin-cuid",
      },
      select: { id: true },
    });

    // Read-only query — must NOT write to AuditLog (L5 is for mutations only).
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("departmentsRouter.setDefaultUser audit-log", () => {
  it("writes audit log on bind with correct entity / action / before-after shape", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({
      ...DEPT_FIXTURE,
      default_user_id: "clh3z8t3d0002qzpqpreviousx",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER_FIXTURE as never);
    vi.mocked(prisma.department.update).mockResolvedValue({
      id: DEPT_FIXTURE.id,
      default_user_id: USER_FIXTURE.id,
    } as never);

    const caller = createCaller(makeCtx());
    await caller.setDefaultUser({
      departmentId: DEPT_FIXTURE.id,
      userId: USER_FIXTURE.id,
    });

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), // tx
      {
        organizationId: "org-tenant-cuid",
        userId: "user-admin-cuid",
        action: "UPDATE",
        entity: "Department",
        entityId: DEPT_FIXTURE.id,
        before: { default_user_id: "clh3z8t3d0002qzpqpreviousx" },
        after: { default_user_id: USER_FIXTURE.id },
      },
    );
  });
});
