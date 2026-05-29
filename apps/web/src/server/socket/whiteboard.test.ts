import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import {
  WHITEBOARD_CLEAR_EVENT,
  WHITEBOARD_CURSOR_EVENT,
  WHITEBOARD_STROKE_EVENT,
  attachWhiteboardHandlers,
} from "./whiteboard";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

vi.mock("@yelli/db", () => ({
  prisma: { meeting: { findUnique: vi.fn() } },
}));

vi.mock("@/server/socket/channels", () => ({
  emitToOrg: vi.fn(),
  joinOrgChannel: vi.fn(),
}));

type EventListener = (payload: unknown) => void;

interface FakeSocket {
  data: { session?: SocketSession };
  on: ReturnType<typeof vi.fn>;
  __emit: (event: string, payload: unknown) => void;
}

function makeFakeSocket(session?: SocketSession): FakeSocket {
  const listeners = new Map<string, Set<EventListener>>();
  const on = vi.fn((event: string, listener: EventListener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    const bucket = listeners.get(event);
    if (bucket) bucket.add(listener);
  });
  return {
    data: session !== undefined ? { session } : {},
    on,
    __emit: (event, payload) => {
      const set = listeners.get(event);
      if (set) {
        for (const listener of set) listener(payload);
      }
    },
  };
}

const SAMPLE_SESSION: SocketSession = {
  userId: "user_alice",
  organizationId: "org_acme",
  organizationSlug: "acme",
  role: "host",
  isSuperAdmin: false,
  securityVersion: 1,
};

const fakeIO = {} as IOServer;

function castSocket(fake: FakeSocket): Socket {
  return fake as unknown as Socket;
}

/** Flush all pending microtasks (async socket handlers). */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("attachWhiteboardHandlers", () => {
  beforeEach(() => {
    vi.mocked(emitToOrg).mockClear();
    vi.mocked(joinOrgChannel).mockClear();
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({
      organization_id: SAMPLE_SESSION.organizationId,
    } as never);
  });

  // ── 1. channel joins ──────────────────────────────────────────────────────

  it("joins 3 org channels when session present", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    expect(joinOrgChannel).toHaveBeenCalledTimes(3);
    expect(joinOrgChannel).toHaveBeenCalledWith(socket, WHITEBOARD_STROKE_EVENT);
    expect(joinOrgChannel).toHaveBeenCalledWith(socket, WHITEBOARD_CURSOR_EVENT);
    expect(joinOrgChannel).toHaveBeenCalledWith(socket, WHITEBOARD_CLEAR_EVENT);
  });

  // ── 2. no-op without session ──────────────────────────────────────────────

  it("is a no-op when session is undefined", () => {
    const socket = makeFakeSocket(undefined);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    expect(joinOrgChannel).not.toHaveBeenCalled();
    expect(socket.on).not.toHaveBeenCalled();
  });

  // ── 3. stroke happy path ──────────────────────────────────────────────────

  it("relays valid whiteboard:stroke via emitToOrg", async () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    const payload = {
      meetingId: "meet_1",
      strokeId: "stroke_abc",
      points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      color: "#ff0000",
      width: 3,
    };
    socket.__emit(WHITEBOARD_STROKE_EVENT, payload);
    await flushAsync();
    expect(emitToOrg).toHaveBeenCalledTimes(1);
    expect(emitToOrg).toHaveBeenCalledWith(
      fakeIO,
      "org_acme",
      WHITEBOARD_STROKE_EVENT,
      payload,
    );
  });

  // ── 4. stroke oversize ────────────────────────────────────────────────────

  it("drops whiteboard:stroke when payload exceeds 32 KB", async () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    // ~1500 points ≈ 1500 * ~18 bytes each = ~27 KB for points array alone;
    // padding color/width/ids pushes it over 32 KB
    const points = Array.from({ length: 1800 }, (_, i) => ({
      x: i * 1.1,
      y: i * 2.2,
    }));
    const oversizePayload = {
      meetingId: "meet_1",
      strokeId: "stroke_big",
      points,
      color: "#00ff00",
      width: 2,
    };
    socket.__emit(WHITEBOARD_STROKE_EVENT, oversizePayload);
    await flushAsync();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 5. stroke invalid (missing meetingId) ─────────────────────────────────

  it("drops whiteboard:stroke with missing meetingId", async () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(WHITEBOARD_STROKE_EVENT, {
      strokeId: "stroke_abc",
      points: [{ x: 1, y: 2 }],
      color: "#000000",
      width: 1,
    });
    await flushAsync();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 6. cursor happy path ──────────────────────────────────────────────────

  it("relays valid whiteboard:cursor via emitToOrg, server-stamping userId", async () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    const payload = {
      meetingId: "meet_1",
      x: 55.5,
      y: 120.0,
    };
    socket.__emit(WHITEBOARD_CURSOR_EVENT, payload);
    await flushAsync();
    expect(emitToOrg).toHaveBeenCalledTimes(1);
    expect(emitToOrg).toHaveBeenCalledWith(
      fakeIO,
      "org_acme",
      WHITEBOARD_CURSOR_EVENT,
      { ...payload, userId: SAMPLE_SESSION.userId },
    );
  });

  // ── 7. cursor invalid (missing meetingId) ────────────────────────────────

  it("drops whiteboard:cursor with missing meetingId", async () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(WHITEBOARD_CURSOR_EVENT, { x: 10, y: 20 });
    await flushAsync();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 8. clear happy path ───────────────────────────────────────────────────

  it("relays valid whiteboard:clear via emitToOrg", async () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    const payload = { meetingId: "meet_1" };
    socket.__emit(WHITEBOARD_CLEAR_EVENT, payload);
    await flushAsync();
    expect(emitToOrg).toHaveBeenCalledTimes(1);
    expect(emitToOrg).toHaveBeenCalledWith(
      fakeIO,
      "org_acme",
      WHITEBOARD_CLEAR_EVENT,
      payload,
    );
  });

  // ── 9. clear invalid (missing meetingId) ─────────────────────────────────

  it("drops whiteboard:clear with missing meetingId", async () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(WHITEBOARD_CLEAR_EVENT, {});
    await flushAsync();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 10. cross-org gate — stroke ───────────────────────────────────────────

  it("drops whiteboard:stroke when meeting belongs to different org", async () => {
    vi.mocked(prisma.meeting.findUnique).mockResolvedValueOnce({
      organization_id: "org_other",
    } as never);
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(WHITEBOARD_STROKE_EVENT, {
      meetingId: "meet_1",
      strokeId: "stroke_abc",
      points: [{ x: 10, y: 20 }],
      color: "#ff0000",
      width: 3,
    });
    await flushAsync();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("drops whiteboard:stroke when meeting not found", async () => {
    vi.mocked(prisma.meeting.findUnique).mockResolvedValueOnce(null);
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(WHITEBOARD_STROKE_EVENT, {
      meetingId: "meet_ghost",
      strokeId: "stroke_abc",
      points: [{ x: 10, y: 20 }],
      color: "#ff0000",
      width: 3,
    });
    await flushAsync();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 11. cross-org gate — cursor ───────────────────────────────────────────

  it("drops whiteboard:cursor when meeting belongs to different org", async () => {
    vi.mocked(prisma.meeting.findUnique).mockResolvedValueOnce({
      organization_id: "org_other",
    } as never);
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(WHITEBOARD_CURSOR_EVENT, { meetingId: "meet_1", x: 10, y: 20 });
    await flushAsync();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 12. cross-org gate — clear ────────────────────────────────────────────

  it("drops whiteboard:clear when meeting belongs to different org", async () => {
    vi.mocked(prisma.meeting.findUnique).mockResolvedValueOnce({
      organization_id: "org_other",
    } as never);
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachWhiteboardHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(WHITEBOARD_CLEAR_EVENT, { meetingId: "meet_1" });
    await flushAsync();
    expect(emitToOrg).not.toHaveBeenCalled();
  });
});
