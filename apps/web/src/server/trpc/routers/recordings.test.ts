import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  startRoomCompositeRecording,
  stopRoomEgress,
} from "@/lib/livekit/egress-client";
import { recordingsRouter } from "@/server/trpc/routers/recordings";
import { createCallerFactory } from "@/server/trpc/trpc";

vi.mock("@yelli/db", () => {
  const txMock = {
    recording: { create: vi.fn() },
    meeting: { update: vi.fn() },
  };
  return {
    prisma: {
      meeting: { findUnique: vi.fn() },
      callLog: { findFirst: vi.fn() },
      recording: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn(
        async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      ),
    },
    writeAuditLog: vi.fn(),
    runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
    __txMock: txMock,
  };
});

vi.mock("@yelli/storage", () => ({
  buildStorageKey: vi.fn(
    (org: string, ent: string, ext: string) =>
      `${org}/${ent}/random-cuid.${ext}`,
  ),
  getDownloadUrl: vi.fn(),
  verifyKeyOwnership: vi.fn(() => true),
}));

vi.mock("@/lib/livekit/egress-client", () => ({
  startRoomCompositeRecording: vi.fn(),
  stopRoomEgress: vi.fn(),
}));

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    auth: { check: vi.fn() },
    api: { check: vi.fn() },
    public: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

const createCaller = createCallerFactory(recordingsRouter);

const SESSION_USER = {
  id: "clgb84nz40000uhcggwxf9eri",
  email: "host@example.com",
  name: "Host User",
  displayName: "Host User",
  organizationId: "clgb84nz40000uhcggwxorgz",
  organizationSlug: "tenant-org",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

const NON_HOST_USER = { ...SESSION_USER, id: "clgb84nz40000uhcggwx9999" };

function makeCtx(user = SESSION_USER) {
  return {
    session: { user, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/recordings.start", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const MEETING_ID = "clgb84nz40001uhcggwxf9eri";
const CALL_LOG_ID = "clgb84nz40002uhcggwxf9eri";
const RECORDING_ID = "clgb84nz40003uhcggwxf9eri";

describe("recordingsRouter.start", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const dbMod = (await import("@yelli/db")) as unknown as {
      __txMock: { recording: { create: ReturnType<typeof vi.fn> }; meeting: { update: ReturnType<typeof vi.fn> } };
    };
    dbMod.__txMock.recording.create.mockResolvedValue({ id: RECORDING_ID });
    dbMod.__txMock.meeting.update.mockResolvedValue(undefined);

    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({
      id: MEETING_ID,
      organization_id: SESSION_USER.organizationId,
      host_user_id: SESSION_USER.id,
      livekit_room_name: "room-abc",
      status: "in_progress",
    } as never);
    vi.mocked(prisma.callLog.findFirst).mockResolvedValue({
      id: CALL_LOG_ID,
    } as never);
    vi.mocked(prisma.recording.findFirst).mockResolvedValue(null);
    vi.mocked(startRoomCompositeRecording).mockResolvedValue({
      egressId: "EG_abc",
      roomName: "room-abc",
      status: "EGRESS_STARTING",
    });
  });

  it("happy path: starts Egress and creates Recording row, returns { recordingId, egressId }", async () => {
    const caller = createCaller(makeCtx());
    const res = await caller.start({ meetingId: MEETING_ID });

    expect(startRoomCompositeRecording).toHaveBeenCalledWith({
      roomName: "room-abc",
      storageKey: `${SESSION_USER.organizationId}/recordings/random-cuid.mp4`,
    });
    expect(res).toEqual({ recordingId: RECORDING_ID, egressId: "EG_abc" });
  });

  it("NOT_FOUND when meeting is in a different tenant", async () => {
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({
      id: MEETING_ID,
      organization_id: "other-org",
      host_user_id: SESSION_USER.id,
      livekit_room_name: "room-abc",
      status: "in_progress",
    } as never);

    const caller = createCaller(makeCtx());
    await expect(caller.start({ meetingId: MEETING_ID })).rejects.toThrow(
      TRPCError,
    );
    await expect(
      caller.start({ meetingId: MEETING_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(startRoomCompositeRecording).not.toHaveBeenCalled();
  });

  it("FORBIDDEN when caller is not the meeting host", async () => {
    const caller = createCaller(makeCtx(NON_HOST_USER));
    await expect(
      caller.start({ meetingId: MEETING_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(startRoomCompositeRecording).not.toHaveBeenCalled();
  });

  it("PRECONDITION_FAILED when no active CallLog exists", async () => {
    vi.mocked(prisma.callLog.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(
      caller.start({ meetingId: MEETING_ID }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(startRoomCompositeRecording).not.toHaveBeenCalled();
  });

  it("CONFLICT when a recording is already in progress", async () => {
    vi.mocked(prisma.recording.findFirst).mockResolvedValue({
      id: "existing",
    } as never);
    const caller = createCaller(makeCtx());
    await expect(
      caller.start({ meetingId: MEETING_ID }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(startRoomCompositeRecording).not.toHaveBeenCalled();
  });

  it("SERVICE_UNAVAILABLE when LiveKit Egress start fails (no DB row created)", async () => {
    vi.mocked(startRoomCompositeRecording).mockRejectedValueOnce(
      new Error("livekit down"),
    );
    const dbMod = (await import("@yelli/db")) as unknown as {
      __txMock: { recording: { create: ReturnType<typeof vi.fn> } };
    };
    const caller = createCaller(makeCtx());
    await expect(
      caller.start({ meetingId: MEETING_ID }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(dbMod.__txMock.recording.create).not.toHaveBeenCalled();
  });
});

describe("recordingsRouter.stop", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const dbMod = (await import("@yelli/db")) as unknown as {
      __txMock: { meeting: { update: ReturnType<typeof vi.fn> } };
    };
    dbMod.__txMock.meeting.update.mockResolvedValue(undefined);

    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({
      id: MEETING_ID,
      organization_id: SESSION_USER.organizationId,
      host_user_id: SESSION_USER.id,
    } as never);
    vi.mocked(prisma.recording.findFirst).mockResolvedValue({
      id: RECORDING_ID,
      egress_id: "EG_abc",
    } as never);
    vi.mocked(stopRoomEgress).mockResolvedValue(undefined);
  });

  it("happy path: stops egress and flips Meeting.recording_enabled=false", async () => {
    const caller = createCaller(makeCtx());
    const res = await caller.stop({ meetingId: MEETING_ID });
    expect(stopRoomEgress).toHaveBeenCalledWith("EG_abc");
    expect(res).toEqual({ ok: true });
  });

  it("FORBIDDEN when caller is not the meeting host", async () => {
    const caller = createCaller(makeCtx(NON_HOST_USER));
    await expect(
      caller.stop({ meetingId: MEETING_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(stopRoomEgress).not.toHaveBeenCalled();
  });

  it("NOT_FOUND when no active recording exists", async () => {
    vi.mocked(prisma.recording.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(
      caller.stop({ meetingId: MEETING_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(stopRoomEgress).not.toHaveBeenCalled();
  });

  it("treats stopEgress error as already-stopped (does not throw)", async () => {
    vi.mocked(stopRoomEgress).mockRejectedValueOnce(new Error("already done"));
    const caller = createCaller(makeCtx());
    const res = await caller.stop({ meetingId: MEETING_ID });
    expect(res).toEqual({ ok: true });
  });
});
