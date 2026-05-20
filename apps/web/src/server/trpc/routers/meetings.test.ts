import { TRPCError } from "@trpc/server";
import { platformPrisma, prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mintLiveKitToken } from "@/lib/livekit/client";
import { rateLimiters } from "@/server/lib/rate-limit";
import { verifyTurnstileToken } from "@/server/lib/turnstile";
import { meetingsRouter } from "@/server/trpc/routers/meetings";
import { createCallerFactory } from "@/server/trpc/trpc";

// vi.mock factories hoist above imports. The mocks below run before the
// imports above resolve, so the meetingsRouter we load sees the mocked
// prisma + platformPrisma + runWithTenantContext.
vi.mock("@yelli/db", () => ({
  prisma: {
    meeting: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  // L6-bypass client used by guest-facing exchangeGuestToken — guests have no
  // session at request time, so tenant context is unavailable. Token IS the
  // auth (lookup by Meeting.meeting_link_token @unique).
  platformPrisma: {
    meeting: { findUnique: vi.fn() },
    participant: { create: vi.fn() },
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

vi.mock("@/server/lib/turnstile", () => ({
  verifyTurnstileToken: vi.fn(),
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
  organizationSlug: "tenant-org",
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

// ─────────────────────────────────────────────────────────────
// exchangeGuestToken — publicProcedure (no session required)
// ─────────────────────────────────────────────────────────────
//
// Guest joins flow: visitor clicks a shared link `/join/<meeting_link_token>`,
// enters display name + passes Turnstile, calls this mutation. Server validates
// token (NOT_FOUND for unknown/cancelled/ended — same generic message to prevent
// enumeration), enforces non-locked guard, creates a Participant guest row, and
// mints a LiveKit JWT scoped to the meeting's room. organizationId is NEVER
// returned to the client (Rule 0).

const guestMeetingFixture = {
  id: "meeting-guest-cuid",
  organization_id: "org-host-cuid",
  status: "active" as const,
  locked: false,
  livekit_room_name: "meeting-room-name",
  meeting_link_token: "guest-token-abc123",
};

const validGuestInput = {
  token: "guest-token-abc123",
  displayName: "Jane Smith",
  turnstileToken: "turnstile-pass",
};

function guestCtx() {
  return {
    session: null,
    req: new Request(
      "http://localhost/api/trpc/meetings.exchangeGuestToken",
      {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.5" },
      },
    ),
  };
}

describe("meetingsRouter.exchangeGuestToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimiters.public.check).mockImplementation(() => {});
    vi.mocked(verifyTurnstileToken).mockResolvedValue({
      success: true,
      errorCodes: [],
    });
    vi.mocked(platformPrisma.meeting.findUnique).mockResolvedValue(
      guestMeetingFixture as never,
    );
    vi.mocked(platformPrisma.participant.create).mockImplementation((async (
      args: unknown,
    ) => {
      const { data } = args as {
        data: {
          organization_id: string;
          meeting_id: string;
          guest_display_name: string;
        };
      };
      return {
        id: "participant-guest-cuid",
        organization_id: data.organization_id,
        meeting_id: data.meeting_id,
        guest_display_name: data.guest_display_name,
        user_id: null,
        role_in_meeting: "participant",
        joined_at: new Date("2026-05-20T12:00:00.000Z"),
        left_at: null,
      };
    }) as never);
    vi.mocked(mintLiveKitToken).mockReturnValue({
      token: "fake-livekit-jwt",
      wsUrl: "wss://livekit.local:43532",
    });
  });

  it("happy path: returns { meetingId, livekitJwt, wsUrl, roomName } and never leaks organization_id", async () => {
    const caller = createCaller(guestCtx());
    const res = await caller.exchangeGuestToken(validGuestInput);

    expect(res).toEqual({
      meetingId: "meeting-guest-cuid",
      livekitJwt: "fake-livekit-jwt",
      wsUrl: "wss://livekit.local:43532",
      roomName: "meeting-room-name",
    });
    expect(res).not.toHaveProperty("organizationId");
    expect(res).not.toHaveProperty("organization_id");

    // Looked up by token only — never by org id (token IS the auth).
    expect(platformPrisma.meeting.findUnique).toHaveBeenCalledWith({
      where: { meeting_link_token: "guest-token-abc123" },
      select: expect.any(Object),
    });

    // Participant row was stamped with org_id from the looked-up meeting
    // (NOT trusted from client), and the guest_display_name was trimmed input.
    const partArg = vi.mocked(platformPrisma.participant.create).mock
      .calls[0]?.[0] as {
      data: {
        organization_id: string;
        meeting_id: string;
        guest_display_name: string;
        user_id: null;
      };
    };
    expect(partArg.data.organization_id).toBe("org-host-cuid");
    expect(partArg.data.meeting_id).toBe("meeting-guest-cuid");
    expect(partArg.data.guest_display_name).toBe("Jane Smith");
    expect(partArg.data.user_id).toBeNull();

    // LiveKit minted for the room name from the meeting (NEVER from client).
    expect(mintLiveKitToken).toHaveBeenCalledWith(
      expect.objectContaining({
        roomName: "meeting-room-name",
        displayName: "Jane Smith",
        canPublish: true,
      }),
    );
  });

  it("rate-limit triggers first → TOO_MANY_REQUESTS, no turnstile + no DB call", async () => {
    vi.mocked(rateLimiters.public.check).mockImplementationOnce(() => {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Try again later.",
      });
    });
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken(validGuestInput),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(platformPrisma.meeting.findUnique).not.toHaveBeenCalled();
    expect(mintLiveKitToken).not.toHaveBeenCalled();
  });

  it("rate-limit keyed by client IP (x-forwarded-for)", async () => {
    const caller = createCaller(guestCtx());
    await caller.exchangeGuestToken(validGuestInput);
    expect(rateLimiters.public.check).toHaveBeenCalledWith(
      expect.stringContaining("203.0.113.5"),
    );
  });

  it("turnstile failure → UNAUTHORIZED, no DB call", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce({
      success: false,
      errorCodes: ["invalid-input-response"],
    });
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken(validGuestInput),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(platformPrisma.meeting.findUnique).not.toHaveBeenCalled();
    expect(mintLiveKitToken).not.toHaveBeenCalled();
  });

  it("unknown token → generic NOT_FOUND 'Invalid or expired link.'", async () => {
    vi.mocked(platformPrisma.meeting.findUnique).mockResolvedValueOnce(null);
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken(validGuestInput),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Invalid or expired link.",
    });
    expect(mintLiveKitToken).not.toHaveBeenCalled();
    expect(platformPrisma.participant.create).not.toHaveBeenCalled();
  });

  it("cancelled meeting → same generic NOT_FOUND (no enumeration)", async () => {
    vi.mocked(platformPrisma.meeting.findUnique).mockResolvedValueOnce({
      ...guestMeetingFixture,
      status: "cancelled",
    } as never);
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken(validGuestInput),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Invalid or expired link.",
    });
    expect(mintLiveKitToken).not.toHaveBeenCalled();
  });

  it("ended meeting → same generic NOT_FOUND (no enumeration)", async () => {
    vi.mocked(platformPrisma.meeting.findUnique).mockResolvedValueOnce({
      ...guestMeetingFixture,
      status: "ended",
    } as never);
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken(validGuestInput),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Invalid or expired link.",
    });
    expect(mintLiveKitToken).not.toHaveBeenCalled();
  });

  it("locked meeting → same generic NOT_FOUND (no enumeration — guest cannot learn the meeting exists)", async () => {
    vi.mocked(platformPrisma.meeting.findUnique).mockResolvedValueOnce({
      ...guestMeetingFixture,
      locked: true,
    } as never);
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken(validGuestInput),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Invalid or expired link.",
    });
    expect(mintLiveKitToken).not.toHaveBeenCalled();
    expect(platformPrisma.participant.create).not.toHaveBeenCalled();
  });

  it("LiveKit mint failure → SERVICE_UNAVAILABLE, no participant row written", async () => {
    vi.mocked(mintLiveKitToken).mockImplementationOnce(() => {
      throw new Error("LiveKit not configured");
    });
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken(validGuestInput),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(platformPrisma.participant.create).not.toHaveBeenCalled();
  });

  it("Zod rejects empty displayName", async () => {
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken({ ...validGuestInput, displayName: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rateLimiters.public.check).not.toHaveBeenCalled();
  });

  it("Zod rejects displayName > 60 chars", async () => {
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken({
        ...validGuestInput,
        displayName: "x".repeat(61),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("Zod rejects empty token", async () => {
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken({ ...validGuestInput, token: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(platformPrisma.meeting.findUnique).not.toHaveBeenCalled();
  });

  it("Zod rejects missing turnstileToken", async () => {
    const caller = createCaller(guestCtx());
    await expect(
      // @ts-expect-error — proving strict() requires turnstileToken
      caller.exchangeGuestToken({
        token: "guest-token-abc123",
        displayName: "Jane Smith",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("strict schema rejects unknown fields (e.g. client trying to inject organizationId)", async () => {
    const caller = createCaller(guestCtx());
    await expect(
      caller.exchangeGuestToken({
        ...validGuestInput,
        // @ts-expect-error — proving strict() drops/rejects unknown keys
        organizationId: "attacker-org",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(platformPrisma.meeting.findUnique).not.toHaveBeenCalled();
  });

  it("trims whitespace on displayName before storing/minting", async () => {
    const caller = createCaller(guestCtx());
    await caller.exchangeGuestToken({
      ...validGuestInput,
      displayName: "   Jane Smith   ",
    });
    const partArg = vi.mocked(platformPrisma.participant.create).mock
      .calls[0]?.[0] as {
      data: { guest_display_name: string };
    };
    expect(partArg.data.guest_display_name).toBe("Jane Smith");
    expect(mintLiveKitToken).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Jane Smith" }),
    );
  });
});
