import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimiters } from "@/server/lib/rate-limit";
import { callsRouter } from "@/server/trpc/routers/calls";
import { createCallerFactory } from "@/server/trpc/trpc";

vi.mock("@yelli/db", () => ({
  prisma: {
    department: {
      findUnique: vi.fn(),
    },
    callLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    auth: { check: vi.fn() },
    api: { check: vi.fn() },
    public: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

vi.mock("@/lib/livekit/client", () => ({
  mintLiveKitToken: vi.fn(),
}));

vi.mock("@/server/lib/call-log", () => ({
  recordIntercomCallLog: vi.fn(),
}));

vi.mock("@/server/socket/channels", () => ({
  emitToOrg: vi.fn(),
}));

vi.mock("@/server/socket/server", () => ({
  getIO: vi.fn(),
}));

const createCaller = createCallerFactory(callsRouter);

const SESSION_USER = {
  id: "clgb84nz40000uhcggwxf9eri",
  email: "caller@example.com",
  name: "Caller User",
  displayName: "Caller User",
  organizationId: "org-tenant-cuid",
  organizationSlug: "tenant-org",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

function makeCtx() {
  return {
    session: { user: SESSION_USER, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/calls.initiate", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const VALID_DEPT_ID = "clgb84nz40001uhcggwxf9eri";

describe("callsRouter.initiate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(rateLimiters.api.check).mockImplementation(() => {});

    const { mintLiveKitToken } = await import("@/lib/livekit/client");
    vi.mocked(mintLiveKitToken).mockReturnValue({
      token: "lk-token-abc",
      wsUrl: "wss://livekit.example.com",
    });

    const { getIO } = await import("@/server/socket/server");
    vi.mocked(getIO).mockReturnValue({
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as unknown as ReturnType<typeof getIO>);

    vi.mocked(prisma.department.findUnique).mockImplementation((async () => ({
      id: VALID_DEPT_ID,
      name: "Operations",
    })) as never);
  });

  it("happy path: emits via emitToOrg and returns call connection details", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");

    const caller = createCaller(makeCtx());
    const res = await caller.initiate({
      recipientDepartmentId: VALID_DEPT_ID,
    });

    expect(res).toMatchObject({
      callId: expect.any(String),
      roomName: expect.any(String),
      token: "lk-token-abc",
      wsUrl: "wss://livekit.example.com",
      recipientDepartmentName: "Operations",
    });

    expect(emitToOrg).toHaveBeenCalledTimes(1);
    const [, orgId, eventType, payload] = vi.mocked(emitToOrg).mock.calls[0]!;
    expect(orgId).toBe("org-tenant-cuid");
    expect(eventType).toBe("call:incoming");
    expect(payload).toMatchObject({
      callId: expect.any(String),
      roomName: expect.any(String),
      callerName: "Caller User",
      callerDepartment: null,
      recipientDeptId: VALID_DEPT_ID,
    });
  });

  it("department not found → throws NOT_FOUND, no emit", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");

    vi.mocked(prisma.department.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.initiate({ recipientDepartmentId: VALID_DEPT_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("getIO() returns null → returns connection details, no emit (graceful degradation)", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");
    const { getIO } = await import("@/server/socket/server");
    vi.mocked(getIO).mockReturnValue(null);

    const caller = createCaller(makeCtx());
    const res = await caller.initiate({
      recipientDepartmentId: VALID_DEPT_ID,
    });

    expect(res).toMatchObject({
      callId: expect.any(String),
      roomName: expect.any(String),
      token: "lk-token-abc",
      wsUrl: "wss://livekit.example.com",
      recipientDepartmentName: "Operations",
    });
    expect(emitToOrg).not.toHaveBeenCalled();
  });
});
