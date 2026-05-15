import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimiters } from "@/server/lib/rate-limit";
import { meetingsRouter } from "@/server/trpc/routers/meetings";
import { createCallerFactory } from "@/server/trpc/trpc";

// vi.mock factories hoist above imports. The mocks below run before the
// imports above resolve, so the meetingsRouter we load sees the mocked
// prisma + runWithTenantContext.
vi.mock("@yelli/db", () => ({
  prisma: {
    meeting: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  // Pass-through: skip the AsyncLocalStorage L6 plumbing in tests.
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
  recordMeetingCallLog: vi.fn(),
}));

const createCaller = createCallerFactory(meetingsRouter);

// Augmented Auth.js Session shape (see apps/web/src/types/next-auth.d.ts) —
// expects User-base fields plus our org/role/security extensions.
const SESSION_USER = {
  id: "user-host-cuid",
  email: "host@example.com",
  name: "Host User",
  displayName: "Host User",
  organizationId: "org-tenant-cuid",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

function makeCtx() {
  return {
    session: { user: SESSION_USER, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/meetings.create", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const validCreateInput = {
  title: "Weekly standup",
  description: "Team sync",
  scheduled_at: new Date("2026-06-01T10:00:00.000Z"),
  recording_enabled: true,
  lobby_enabled: false,
};

describe("meetingsRouter.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimiters.api.check).mockImplementation(() => {});
    // Prisma's create returns DynamicModelExtensionFluentApi (not just Promise).
    // Cast the impl through `never` per the trpc-test-pattern lessons.md entry.
    vi.mocked(prisma.meeting.create).mockImplementation((async (args: unknown) => {
      const { data } = args as {
        data: {
          organization_id: string;
          host_user_id: string;
          title: string;
          description: string | null;
          scheduled_at: Date | null;
          recording_enabled: boolean;
          lobby_enabled: boolean;
          meeting_link_token: string;
          livekit_room_name: string;
        };
      };
      return {
        id: "meeting-new-cuid",
        title: data.title,
        description: data.description,
        status: "scheduled",
        scheduled_at: data.scheduled_at,
        recording_enabled: data.recording_enabled,
        lobby_enabled: data.lobby_enabled,
        meeting_link_token: data.meeting_link_token,
        livekit_room_name: data.livekit_room_name,
        created_at: new Date("2026-05-15T16:00:00.000Z"),
      };
    }) as never);
  });

  it("happy path: stamps server fields, returns meeting projection", async () => {
    const caller = createCaller(makeCtx());
    const res = await caller.create(validCreateInput);

    expect(res).toMatchObject({
      id: "meeting-new-cuid",
      title: "Weekly standup",
      description: "Team sync",
      status: "scheduled",
      recording_enabled: true,
      lobby_enabled: false,
    });
    expect(res.meeting_link_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.livekit_room_name).toMatch(/^meeting-[0-9a-f-]{36}$/);

    expect(prisma.meeting.create).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(prisma.meeting.create).mock.calls[0]?.[0] as {
      data: { organization_id: string; host_user_id: string; status: string };
    };
    // Server stamps these — they are NOT in the input shape.
    expect(callArg.data.organization_id).toBe("org-tenant-cuid");
    expect(callArg.data.host_user_id).toBe("user-host-cuid");
    expect(callArg.data.status).toBe("scheduled");
  });

  it("minimal input: title only → defaults recording=false, lobby=false, description=null", async () => {
    const caller = createCaller(makeCtx());
    await caller.create({ title: "Ad-hoc call" });

    const callArg = vi.mocked(prisma.meeting.create).mock.calls[0]?.[0] as {
      data: {
        title: string;
        description: string | null;
        scheduled_at: Date | null;
        recording_enabled: boolean;
        lobby_enabled: boolean;
      };
    };
    expect(callArg.data.title).toBe("Ad-hoc call");
    expect(callArg.data.description).toBeNull();
    expect(callArg.data.scheduled_at).toBeNull();
    expect(callArg.data.recording_enabled).toBe(false);
    expect(callArg.data.lobby_enabled).toBe(false);
  });

  it("Zod rejects empty title (min 1)", async () => {
    const caller = createCaller(makeCtx());
    await expect(caller.create({ title: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });

  it("Zod rejects title >300 chars", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ title: "x".repeat(301) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });

  it("Zod rejects description >2000 chars", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ title: "ok", description: "x".repeat(2001) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });

  it("strict schema rejects unknown fields (e.g. client trying to set status)", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({
        title: "ok",
        // @ts-expect-error — proving strict() drops/rejects unknown keys
        status: "active",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });

  it("unauthenticated session → UNAUTHORIZED, no rate-limit call", async () => {
    const caller = createCaller({
      ...makeCtx(),
      session: null,
    });
    await expect(caller.create(validCreateInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(rateLimiters.api.check).not.toHaveBeenCalled();
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });
});
