/**
 * Phase 7 #11 — `attachUserPresenceHandlers` unit tests.
 *
 * The Socket.IO server emits two events for user-level presence
 * (apps/web/src/server/socket/presence.ts):
 *   - `presence:snapshot` {userIds[]} — sent socket-direct on connect; the
 *     initial roster of online users in the org.
 *   - `presence:user` {userId, online} — broadcast to the org channel when
 *     a user's online count transitions 0→1 (online) or 1→0 (offline).
 *
 * This pure handler surfaces both as callbacks. `useUserPresence` composes
 * it with `useState` + `useSocketOptional` to drive a Record<userId, boolean>.
 * Pure module (no React) keeps it node-env testable per the
 * [[pure-helper-extraction-pattern]] (Phase 7 #7c-2 / #8e / #10).
 */
import { describe, expect, it, vi } from "vitest";

import {
  attachUserPresenceHandlers,
  type MinimalSocketEventTarget,
} from "@/lib/presence/user-presence-handler";

/**
 * The production interface is intentionally overloaded by event name so
 * consumers get strict payload types from a real TypedSocket. In tests we
 * want one loosely-typed listener bag that can stand in for any event; we
 * cast at the boundary (the only place TS needs the strict shape) and keep
 * the fake's internals plain. This is the same boundary-cast pattern used
 * by revalidation.test.ts (`as never`) and channels.test.ts (`as unknown as
 * IOServer`).
 */
function makeFakeSocket(): {
  socket: MinimalSocketEventTarget;
  listeners: Map<string, Set<(...args: unknown[]) => void>>;
  /** Simulate server → client event delivery (drives registered listeners). */
  fireFromServer: (event: string, ...args: unknown[]) => void;
  /** Capture of client → server emits (e.g. the presence:ready handshake). */
  emittedToServer: Array<{ event: string; args: unknown[] }>;
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emittedToServer: Array<{ event: string; args: unknown[] }> = [];
  const loose = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const set = listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
      set.add(handler);
      listeners.set(event, set);
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
    },
    emit: (event: string, ...args: unknown[]) => {
      emittedToServer.push({ event, args });
    },
  };
  const fireFromServer = (event: string, ...args: unknown[]) => {
    listeners.get(event)?.forEach((h) => {
      h(...args);
    });
  };
  return {
    socket: loose as unknown as MinimalSocketEventTarget,
    listeners,
    fireFromServer,
    emittedToServer,
  };
}

describe("attachUserPresenceHandlers", () => {
  it("registers listeners for presence:snapshot and presence:user", () => {
    const { socket, listeners } = makeFakeSocket();
    attachUserPresenceHandlers(socket, {
      onRoster: () => undefined,
      onUpdate: () => undefined,
    });
    expect(listeners.get("presence:snapshot")?.size).toBe(1);
    expect(listeners.get("presence:user")?.size).toBe(1);
  });

  it("invokes onRoster with userIds when the server emits presence:snapshot", () => {
    const { socket, fireFromServer: emit } = makeFakeSocket();
    const onRoster = vi.fn();
    attachUserPresenceHandlers(socket, {
      onRoster,
      onUpdate: () => undefined,
    });
    emit("presence:snapshot", { userIds: ["user-a", "user-b"] });
    expect(onRoster).toHaveBeenCalledTimes(1);
    expect(onRoster).toHaveBeenCalledWith(["user-a", "user-b"]);
  });

  it("invokes onUpdate with (userId, online) when the server emits presence:user", () => {
    const { socket, fireFromServer: emit } = makeFakeSocket();
    const onUpdate = vi.fn();
    attachUserPresenceHandlers(socket, {
      onRoster: () => undefined,
      onUpdate,
    });
    emit("presence:user", { userId: "user-x", online: true });
    expect(onUpdate).toHaveBeenCalledWith("user-x", true);

    emit("presence:user", { userId: "user-x", online: false });
    expect(onUpdate).toHaveBeenCalledWith("user-x", false);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("returns a disposer that removes both listeners", () => {
    const { socket, listeners, fireFromServer } = makeFakeSocket();
    const onRoster = vi.fn();
    const onUpdate = vi.fn();
    const dispose = attachUserPresenceHandlers(socket, { onRoster, onUpdate });

    dispose();
    expect(listeners.get("presence:snapshot")?.size).toBe(0);
    expect(listeners.get("presence:user")?.size).toBe(0);

    fireFromServer("presence:snapshot", { userIds: ["user-a"] });
    fireFromServer("presence:user", { userId: "user-x", online: true });
    expect(onRoster).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not fire callbacks for unrelated events (e.g. session:invalidated, call:incoming)", () => {
    const { socket, fireFromServer: emit } = makeFakeSocket();
    const onRoster = vi.fn();
    const onUpdate = vi.fn();
    attachUserPresenceHandlers(socket, { onRoster, onUpdate });

    emit("session:invalidated");
    emit("call:incoming", { foo: "bar" });
    emit("connect");
    emit("disconnect");

    expect(onRoster).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  // --- (fresh-client-presence-snapshot-race) ---------------------------------

  it("emits presence:ready to the server AFTER attaching listeners (handshake)", () => {
    // Race fix: server now defers presence:snapshot emission until it receives
    // presence:ready from this socket. Without this signal the server would
    // never emit and fresh clients would stay with onlineSet=Set(0).
    const { socket, emittedToServer } = makeFakeSocket();
    attachUserPresenceHandlers(socket, {
      onRoster: () => undefined,
      onUpdate: () => undefined,
    });
    const ready = emittedToServer.filter((e) => e.event === "presence:ready");
    expect(ready).toHaveLength(1);
    expect(ready[0]?.args).toEqual([]);
  });

  it("emits presence:ready ONCE per attach call (a second attach is a separate handshake)", () => {
    const { socket, emittedToServer } = makeFakeSocket();
    attachUserPresenceHandlers(socket, {
      onRoster: () => undefined,
      onUpdate: () => undefined,
    });
    expect(
      emittedToServer.filter((e) => e.event === "presence:ready"),
    ).toHaveLength(1);

    attachUserPresenceHandlers(socket, {
      onRoster: () => undefined,
      onUpdate: () => undefined,
    });
    expect(
      emittedToServer.filter((e) => e.event === "presence:ready"),
    ).toHaveLength(2);
  });

  it("emits presence:ready AFTER both listeners have been registered (ordering)", () => {
    // The handshake's whole point is "listener is attached, send me the
    // snapshot now". If presence:ready is emitted before listeners attach,
    // a fast server could emit before the listener exists — same race.
    const events: string[] = [];
    const socket = {
      on: (event: string, _handler: unknown) => {
        events.push(`on:${event}`);
      },
      off: () => undefined,
      emit: (event: string) => {
        events.push(`emit:${event}`);
      },
    } as unknown as MinimalSocketEventTarget;
    attachUserPresenceHandlers(socket, {
      onRoster: () => undefined,
      onUpdate: () => undefined,
    });
    const readyIdx = events.indexOf("emit:presence:ready");
    const snapshotIdx = events.indexOf("on:presence:snapshot");
    const userIdx = events.indexOf("on:presence:user");
    expect(readyIdx).toBeGreaterThan(-1);
    expect(snapshotIdx).toBeGreaterThan(-1);
    expect(userIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(snapshotIdx);
    expect(readyIdx).toBeGreaterThan(userIdx);
  });
});
