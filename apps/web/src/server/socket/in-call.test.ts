/**
 * Phase 7 #14 — `createInCallRoster` + `attachInCallHandlers` unit tests.
 *
 * Mirrors `presence.test.ts` (Phase 7 #11) byte-for-byte in structure.
 * The roster is in-memory state with `{wasFirst}/{isLast}` semantics on
 * the per-user socket count. The handler wires LiveKit-emitted client
 * socket events onto the roster and broadcasts org-scoped on transitions.
 *
 * See `apps/web/src/lib/presence/in-call-handler.ts` for the client-side
 * handler. See `docs/superpowers/specs/2026-05-17-in-call-state-design.md`
 * for the locked design decisions.
 */
import { describe, expect, it, vi } from "vitest";

import {
  attachInCallHandlers,
  createInCallRoster,
} from "@/server/socket/in-call";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

describe("createInCallRoster", () => {
  it("addSocket returns {wasFirst: true} for the first socket of a user", () => {
    const roster = createInCallRoster();
    const result = roster.addSocket("org-1", "user-a", "sock-1");
    expect(result.wasFirst).toBe(true);
  });

  it("addSocket returns {wasFirst: false} when the user already has a socket", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    const result = roster.addSocket("org-1", "user-a", "sock-2");
    expect(result.wasFirst).toBe(false);
  });

  it("removeSocket returns {isLast: true} when removing the last socket of a user", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    const result = roster.removeSocket("org-1", "user-a", "sock-1");
    expect(result.isLast).toBe(true);
  });

  it("removeSocket returns {isLast: false} when the user still has another socket", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    roster.addSocket("org-1", "user-a", "sock-2");
    const result = roster.removeSocket("org-1", "user-a", "sock-1");
    expect(result.isLast).toBe(false);
  });

  it("getInCallUsers returns deduplicated user ids isolated by org", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    roster.addSocket("org-1", "user-a", "sock-2");
    roster.addSocket("org-1", "user-b", "sock-3");
    roster.addSocket("org-2", "user-c", "sock-4");
    expect(roster.getInCallUsers("org-1").sort()).toEqual(["user-a", "user-b"]);
    expect(roster.getInCallUsers("org-2")).toEqual(["user-c"]);
    expect(roster.getInCallUsers("org-unknown")).toEqual([]);
  });
});

/**
 * The handler-wiring tests use the same fake-socket + spy-on-emit pattern
 * established by `presence.test.ts` and `revalidation.test.ts`. We don't
 * import socket.io's real Server class — we hand-roll the minimum surface
 * we exercise and cast at the boundary (the only place TS needs the strict
 * shape) per [[socket-revalidation-test-pattern]].
 */

type EmitSpy = ReturnType<typeof vi.fn>;
type ListenerMap = Map<string, ((...args: unknown[]) => void)[]>;

function makeFakeSocket(opts: {
  session?: SocketSession;
  id?: string;
}): {
  socket: Socket;
  listeners: ListenerMap;
  emitDirect: EmitSpy;
  joinedRooms: string[];
  fireDisconnect: () => void;
} {
  const listeners: ListenerMap = new Map();
  const joinedRooms: string[] = [];
  const emitDirect = vi.fn();

  const socket = {
    id: opts.id ?? "sock-test-1",
    data: { session: opts.session },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    },
    join: (room: string) => {
      joinedRooms.push(room);
    },
    emit: emitDirect,
  } as unknown as Socket;

  const fireDisconnect = () => {
    const arr = listeners.get("disconnect") ?? [];
    arr.forEach((h) => {
      h();
    });
  };

  return { socket, listeners, emitDirect, joinedRooms, fireDisconnect };
}

function makeFakeIO(): {
  io: IOServer;
  emitToRoomSpy: EmitSpy;
  lastRoomTargeted: { room?: string };
} {
  const emitToRoomSpy = vi.fn();
  const lastRoomTargeted: { room?: string } = {};
  const io = {
    to: (room: string) => {
      lastRoomTargeted.room = room;
      return { emit: emitToRoomSpy };
    },
  } as unknown as IOServer;
  return { io, emitToRoomSpy, lastRoomTargeted };
}

const TEST_SESSION: SocketSession = {
  userId: "user-alice",
  organizationId: "org-1",
  organizationSlug: "acme",
  role: "host",
  isSuperAdmin: false,
  securityVersion: 1,
};

describe("attachInCallHandlers", () => {
  it("joins the org-scoped call:active room and emits initial snapshot socket-direct", () => {
    const roster = createInCallRoster();
    const { socket, joinedRooms, emitDirect } = makeFakeSocket({
      session: TEST_SESSION,
    });
    const { io } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });

    expect(joinedRooms).toContain("org-1:call:active");
    expect(emitDirect).toHaveBeenCalledWith("call:active-snapshot", {
      userIds: [],
    });
  });

  it("snapshot includes existing in-call users in the org at connect time", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-bob", "sock-other");
    roster.addSocket("org-1", "user-carol", "sock-other-2");
    roster.addSocket("org-2", "user-stranger", "sock-stranger");

    const { socket, emitDirect } = makeFakeSocket({ session: TEST_SESSION });
    const { io } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });

    const snapshotCall = emitDirect.mock.calls.find(
      ([event]) => event === "call:active-snapshot",
    );
    expect(snapshotCall).toBeDefined();
    const payload = snapshotCall?.[1] as { userIds: string[] };
    expect(payload.userIds.sort()).toEqual(["user-bob", "user-carol"]);
  });

  it("on call:joined when wasFirst, broadcasts call:active {userId, in_call:true} to the org room", () => {
    const roster = createInCallRoster();
    const { socket, listeners } = makeFakeSocket({ session: TEST_SESSION });
    const { io, emitToRoomSpy, lastRoomTargeted } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });

    const joinedListener = listeners.get("call:joined")?.[0];
    expect(joinedListener).toBeDefined();
    joinedListener?.();

    expect(lastRoomTargeted.room).toBe("org-1:call:active");
    expect(emitToRoomSpy).toHaveBeenCalledWith("call:active", {
      userId: "user-alice",
      in_call: true,
    });
  });

  it("on call:joined when NOT wasFirst (user already in-call from another socket), does NOT re-broadcast", () => {
    const roster = createInCallRoster();
    // Pre-seed: user-alice already in-call from a different socket.
    roster.addSocket("org-1", "user-alice", "sock-other");

    const { socket, listeners } = makeFakeSocket({ session: TEST_SESSION });
    const { io, emitToRoomSpy } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });
    // Reset any emits from the snapshot step.
    emitToRoomSpy.mockClear();

    const joinedListener = listeners.get("call:joined")?.[0];
    joinedListener?.();

    // Only the snapshot was emitted, no broadcast.
    expect(emitToRoomSpy).not.toHaveBeenCalled();
  });

  it("on socket disconnect when isLast, broadcasts call:active {userId, in_call:false}", () => {
    const roster = createInCallRoster();
    const { socket, listeners, fireDisconnect } = makeFakeSocket({
      session: TEST_SESSION,
    });
    const { io, emitToRoomSpy } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });
    // Simulate a call:joined to put user-alice in-call.
    listeners.get("call:joined")?.[0]?.();
    emitToRoomSpy.mockClear();

    fireDisconnect();

    expect(emitToRoomSpy).toHaveBeenCalledWith("call:active", {
      userId: "user-alice",
      in_call: false,
    });
  });

  it("defensive: missing socket.data.session is a no-op (no join, no emit, no listeners)", () => {
    const roster = createInCallRoster();
    const { socket, listeners, joinedRooms, emitDirect } = makeFakeSocket({});
    const { io, emitToRoomSpy } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });

    expect(joinedRooms).toEqual([]);
    expect(emitDirect).not.toHaveBeenCalled();
    expect(emitToRoomSpy).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
