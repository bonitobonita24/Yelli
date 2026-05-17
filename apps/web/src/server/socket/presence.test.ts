/**
 * Phase 7 #11 — presence engine unit tests.
 *
 * Two layers under test:
 *
 *   1. `createPresenceRoster()` — pure in-memory roster. A
 *      Map<orgId, Map<userId, Set<socketId>>> that coalesces multi-tab
 *      connections so we only emit ONE online/offline transition per user.
 *      `wasFirst:true` on add ↔ a 0→1 socket count transition for that user
 *      in that org; `isLast:true` on remove ↔ a 1→0 transition.
 *
 *   2. `attachPresenceHandlers({io, socket, roster})` — wires the lifecycle
 *      onto an already-authenticated Socket.IO socket. On call:
 *        a. socket joins `${orgId}:presence:user` so org peers receive updates
 *        b. roster.addSocket() — emit `presence:user` {userId,online:true} to
 *           the org channel IFF wasFirst
 *        c. always emit `presence:snapshot` {userIds[...]} to THIS socket so
 *           it has the initial roster
 *        d. register a disconnect handler that calls roster.removeSocket() and
 *           emits `presence:user` {online:false} IFF isLast.
 *
 * Channel name: the channels helper composes `${orgId}:${eventType}`. We use
 * `presence:user` as the event type so the room is `${orgId}:presence:user`.
 * `presence:snapshot` is socket-direct (no broadcast) — only the newly-
 * connected client needs the initial state.
 *
 * The roster lives in-memory per IOServer process. Multi-instance deploys
 * (post-Phase 6 Redis adapter) need a shared store; for now Yelli runs a
 * single Node process per env and the in-memory store is sufficient.
 */
import { describe, expect, it, vi } from "vitest";

import {
  attachPresenceHandlers,
  createPresenceRoster,
} from "@/server/socket/presence";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

const SESSION_A: SocketSession = {
  userId: "user-a",
  organizationId: "org-1",
  organizationSlug: "acme",
  role: "tenant_admin",
  isSuperAdmin: false,
  securityVersion: 1,
};

const SESSION_B: SocketSession = {
  ...SESSION_A,
  userId: "user-b",
};

describe("createPresenceRoster", () => {
  it("starts empty — getOnlineUsers returns [] for any org", () => {
    const roster = createPresenceRoster();
    expect(roster.getOnlineUsers("org-1")).toEqual([]);
    expect(roster.getOnlineUsers("org-2")).toEqual([]);
  });

  it("addSocket for a new user returns wasFirst:true and lists the user as online", () => {
    const roster = createPresenceRoster();
    expect(roster.addSocket("org-1", "user-a", "sock-1")).toEqual({
      wasFirst: true,
    });
    expect(roster.getOnlineUsers("org-1")).toEqual(["user-a"]);
  });

  it("addSocket for a second socket of the same user returns wasFirst:false (multi-tab)", () => {
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    expect(roster.addSocket("org-1", "user-a", "sock-2")).toEqual({
      wasFirst: false,
    });
    expect(roster.getOnlineUsers("org-1")).toEqual(["user-a"]);
  });

  it("removeSocket of a non-last socket returns isLast:false and keeps user online", () => {
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    roster.addSocket("org-1", "user-a", "sock-2");
    expect(roster.removeSocket("org-1", "user-a", "sock-1")).toEqual({
      isLast: false,
    });
    expect(roster.getOnlineUsers("org-1")).toEqual(["user-a"]);
  });

  it("removeSocket of the last socket returns isLast:true and removes the user", () => {
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    expect(roster.removeSocket("org-1", "user-a", "sock-1")).toEqual({
      isLast: true,
    });
    expect(roster.getOnlineUsers("org-1")).toEqual([]);
  });

  it("isolates orgs — same user in two orgs is tracked independently", () => {
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    roster.addSocket("org-2", "user-a", "sock-2");
    expect(roster.getOnlineUsers("org-1")).toEqual(["user-a"]);
    expect(roster.getOnlineUsers("org-2")).toEqual(["user-a"]);

    roster.removeSocket("org-1", "user-a", "sock-1");
    expect(roster.getOnlineUsers("org-1")).toEqual([]);
    expect(roster.getOnlineUsers("org-2")).toEqual(["user-a"]);
  });

  it("getOnlineUsers returns multiple users from the same org", () => {
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-a", "sock-a");
    roster.addSocket("org-1", "user-b", "sock-b");
    const online = roster.getOnlineUsers("org-1");
    expect(online).toHaveLength(2);
    expect(online).toContain("user-a");
    expect(online).toContain("user-b");
  });

  it("removeSocket on an unknown user/socket is a defensive no-op (isLast:false)", () => {
    const roster = createPresenceRoster();
    expect(roster.removeSocket("org-1", "user-a", "sock-1")).toEqual({
      isLast: false,
    });
    expect(roster.getOnlineUsers("org-1")).toEqual([]);
  });

  it("addSocket of the same (user, socketId) pair twice is idempotent — wasFirst:false the second time", () => {
    // Defensive: Socket.IO never re-fires the connection event for the same
    // socket id, but if some adapter does (test harness, future reconnect-
    // resume semantics), we must not flip wasFirst back to true.
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    expect(roster.addSocket("org-1", "user-a", "sock-1")).toEqual({
      wasFirst: false,
    });
    expect(roster.getOnlineUsers("org-1")).toEqual(["user-a"]);
  });
});

// --- attachPresenceHandlers --------------------------------------------------

interface FakeSocket extends Socket {
  __handlers: Map<string, (...args: unknown[]) => void>;
}

function makeSocket(session: SocketSession | null, id = "sock-1"): FakeSocket {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const fake = {
    id,
    data: { session },
    join: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    __handlers: handlers,
  };
  return fake as unknown as FakeSocket;
}

function makeIo(): {
  io: IOServer;
  to: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
} {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return {
    io: { to } as unknown as IOServer,
    to,
    emit,
  };
}

function fireDisconnect(socket: FakeSocket): void {
  const handler = socket.__handlers.get("disconnect");
  if (handler) handler();
}

describe("attachPresenceHandlers", () => {
  it("joins the org's presence:user channel for an authenticated socket", () => {
    const roster = createPresenceRoster();
    const socket = makeSocket(SESSION_A);
    const { io } = makeIo();
    attachPresenceHandlers({ io, socket, roster });
    expect(socket.join).toHaveBeenCalledWith("org-1:presence:user");
  });

  it("emits presence:user {userId, online:true} to the org channel when this is the user's first socket", () => {
    const roster = createPresenceRoster();
    const socket = makeSocket(SESSION_A);
    const { io, to, emit } = makeIo();
    attachPresenceHandlers({ io, socket, roster });
    expect(to).toHaveBeenCalledWith("org-1:presence:user");
    expect(emit).toHaveBeenCalledWith("presence:user", {
      userId: "user-a",
      online: true,
    });
  });

  it("does NOT emit presence:user when the user already has another socket (second tab)", () => {
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-a", "existing-sock");

    const socket = makeSocket(SESSION_A, "sock-2");
    const { io, to } = makeIo();
    attachPresenceHandlers({ io, socket, roster });
    expect(to).not.toHaveBeenCalledWith("org-1:presence:user");
  });

  it("emits presence:snapshot {userIds} to this socket on connect — including self", () => {
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-b", "other-sock");

    const socket = makeSocket(SESSION_A);
    const { io } = makeIo();
    attachPresenceHandlers({ io, socket, roster });
    expect(socket.emit).toHaveBeenCalledWith(
      "presence:snapshot",
      expect.objectContaining({
        userIds: expect.arrayContaining(["user-a", "user-b"]) as string[],
      }),
    );
  });

  it("on disconnect (last socket): emits presence:user {online:false} to the org channel", () => {
    const roster = createPresenceRoster();
    const socket = makeSocket(SESSION_A);
    const { io, to, emit } = makeIo();
    attachPresenceHandlers({ io, socket, roster });

    // Clear initial connect-time emits before testing disconnect
    to.mockClear();
    emit.mockClear();

    fireDisconnect(socket);
    expect(to).toHaveBeenCalledWith("org-1:presence:user");
    expect(emit).toHaveBeenCalledWith("presence:user", {
      userId: "user-a",
      online: false,
    });
  });

  it("on disconnect (NOT last socket): does NOT emit presence:user", () => {
    const roster = createPresenceRoster();
    roster.addSocket("org-1", "user-a", "other-sock");

    const socket = makeSocket(SESSION_A);
    const { io, to } = makeIo();
    attachPresenceHandlers({ io, socket, roster });

    to.mockClear();
    fireDisconnect(socket);
    expect(to).not.toHaveBeenCalledWith("org-1:presence:user");
  });

  it("cross-org isolation: user-a in org-1 disconnecting does not affect user-a in org-2", () => {
    const roster = createPresenceRoster();
    const socketOrg2 = makeSocket({ ...SESSION_A, organizationId: "org-2" }, "sock-2");
    const { io: io2 } = makeIo();
    attachPresenceHandlers({ io: io2, socket: socketOrg2, roster });

    const socket = makeSocket(SESSION_A);
    const { io, to } = makeIo();
    attachPresenceHandlers({ io, socket, roster });

    to.mockClear();
    fireDisconnect(socket);
    expect(to).toHaveBeenCalledWith("org-1:presence:user");
    expect(to).not.toHaveBeenCalledWith("org-2:presence:user");
    expect(roster.getOnlineUsers("org-2")).toEqual(["user-a"]);
  });

  it("does nothing when socket has no session — defensive guard for pre-auth bugs", () => {
    const roster = createPresenceRoster();
    const socket = makeSocket(null);
    const { io, to } = makeIo();
    attachPresenceHandlers({ io, socket, roster });
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
    expect(to).not.toHaveBeenCalled();
  });

  it("two distinct users in the same org both go online and both appear in each other's snapshot", () => {
    const roster = createPresenceRoster();
    const socketA = makeSocket(SESSION_A, "sock-a");
    const { io: ioA } = makeIo();
    attachPresenceHandlers({ io: ioA, socket: socketA, roster });

    const socketB = makeSocket(SESSION_B, "sock-b");
    const { io: ioB } = makeIo();
    attachPresenceHandlers({ io: ioB, socket: socketB, roster });

    // B's snapshot must contain both users (A connected first, B sees A)
    const bSnapshotCall = vi
      .mocked(socketB.emit)
      .mock.calls.find((c) => c[0] === "presence:snapshot");
    expect(bSnapshotCall).toBeDefined();
    const bPayload = bSnapshotCall?.[1] as { userIds: string[] } | undefined;
    expect(bPayload?.userIds).toEqual(
      expect.arrayContaining(["user-a", "user-b"]),
    );
  });
});
