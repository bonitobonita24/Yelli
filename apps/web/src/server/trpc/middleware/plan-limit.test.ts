import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enforceNumericPlanLimit,
  requirePlanCapability,
} from "./plan-limit";

// vi.mock calls are hoisted by vitest to before all imports at parse time,
// so positioning them after imports is correct — the static import of prisma
// above resolves to the mocked module, not the real one.
vi.mock("@yelli/db", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
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

const mockOrgFindUnique = prisma.organization.findUnique as ReturnType<typeof vi.fn>;

// No default value — undefined must propagate through so the "missing
// organizationId" guard branches are exercised. JS default params resolve
// `undefined` back to the default, which would silently hide the bug.
const makeCtx = (organizationId: string | undefined) => ({
  session: {
    user: {
      id: "user-1",
      roles: ["admin" as const],
      organizationId,
    },
  },
  organizationId,
});

const makeNext = () => vi.fn().mockResolvedValue({ result: "ok" });

describe("enforceNumericPlanLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws FORBIDDEN when current usage is at the free plan limit", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      plan_tier: "free",
    });

    const middleware = enforceNumericPlanLimit("users", async () => 10);
    const ctx = makeCtx("org-1");
    const next = makeNext();

    await expect(
      middleware({
        ctx,
        next,
        path: "user.create",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toThrow(TRPCError);

    await expect(
      middleware({
        ctx,
        next,
        path: "user.create",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when current usage exceeds the free plan limit", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      plan_tier: "free",
    });

    const middleware = enforceNumericPlanLimit("users", async () => 15);
    const ctx = makeCtx("org-1");
    const next = makeNext();

    await expect(
      middleware({
        ctx,
        next,
        path: "user.create",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("calls next when current usage is below the free plan limit", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      plan_tier: "free",
    });

    const middleware = enforceNumericPlanLimit("users", async () => 5);
    const ctx = makeCtx("org-1");
    const next = makeNext();

    await middleware({
      ctx,
      next,
      path: "user.create",
      type: "mutation",
      input: undefined,
      getRawInput: async () => undefined,
      meta: undefined,
      signal: undefined,
    } as Parameters<typeof middleware>[0]);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next for enterprise plan with infinite limit regardless of usage", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      plan_tier: "enterprise",
    });

    const middleware = enforceNumericPlanLimit("users", async () => 99999);
    const ctx = makeCtx("org-1");
    const next = makeNext();

    await middleware({
      ctx,
      next,
      path: "user.create",
      type: "mutation",
      input: undefined,
      getRawInput: async () => undefined,
      meta: undefined,
      signal: undefined,
    } as Parameters<typeof middleware>[0]);

    expect(next).toHaveBeenCalledOnce();
  });

  it("throws UNAUTHORIZED when organizationId is missing from context", async () => {
    const middleware = enforceNumericPlanLimit("users", async () => 5);
    const ctx = makeCtx(undefined);
    const next = makeNext();

    await expect(
      middleware({
        ctx,
        next,
        path: "user.create",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED when organization is not found in DB", async () => {
    mockOrgFindUnique.mockResolvedValue(null);

    const middleware = enforceNumericPlanLimit("users", async () => 5);
    const ctx = makeCtx("org-nonexistent");
    const next = makeNext();

    await expect(
      middleware({
        ctx,
        next,
        path: "user.create",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("requirePlanCapability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws FORBIDDEN when free plan does not have the capability", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      plan_tier: "free",
    });

    const middleware = requirePlanCapability("whiteLabel");
    const ctx = makeCtx("org-1");
    const next = makeNext();

    await expect(
      middleware({
        ctx,
        next,
        path: "org.enableWhiteLabel",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when pro plan does not have the capability", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      plan_tier: "pro",
    });

    const middleware = requirePlanCapability("whiteLabel");
    const ctx = makeCtx("org-1");
    const next = makeNext();

    await expect(
      middleware({
        ctx,
        next,
        path: "org.enableWhiteLabel",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("calls next when enterprise plan has the capability", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      plan_tier: "enterprise",
    });

    const middleware = requirePlanCapability("whiteLabel");
    const ctx = makeCtx("org-1");
    const next = makeNext();

    await middleware({
      ctx,
      next,
      path: "org.enableWhiteLabel",
      type: "mutation",
      input: undefined,
      getRawInput: async () => undefined,
      meta: undefined,
      signal: undefined,
    } as Parameters<typeof middleware>[0]);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next when pro plan has filePersistence capability", async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: "org-1",
      plan_tier: "pro",
    });

    const middleware = requirePlanCapability("filePersistence");
    const ctx = makeCtx("org-1");
    const next = makeNext();

    await middleware({
      ctx,
      next,
      path: "file.persist",
      type: "mutation",
      input: undefined,
      getRawInput: async () => undefined,
      meta: undefined,
      signal: undefined,
    } as Parameters<typeof middleware>[0]);

    expect(next).toHaveBeenCalledOnce();
  });

  it("throws UNAUTHORIZED when organizationId is missing", async () => {
    const middleware = requirePlanCapability("whiteLabel");
    const ctx = makeCtx(undefined);
    const next = makeNext();

    await expect(
      middleware({
        ctx,
        next,
        path: "org.enableWhiteLabel",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED when organization is not found in DB", async () => {
    mockOrgFindUnique.mockResolvedValue(null);

    const middleware = requirePlanCapability("whiteLabel");
    const ctx = makeCtx("org-nonexistent");
    const next = makeNext();

    await expect(
      middleware({
        ctx,
        next,
        path: "org.enableWhiteLabel",
        type: "mutation",
        input: undefined,
        getRawInput: async () => undefined,
        meta: undefined,
        signal: undefined,
      } as Parameters<typeof middleware>[0])
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
