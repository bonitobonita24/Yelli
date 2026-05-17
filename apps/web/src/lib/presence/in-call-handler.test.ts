/**
 * Phase 7 #14 — `attachInCallHandlers` (client-side) unit tests.
 *
 * The Socket.IO server emits two events for in-call state
 * (apps/web/src/server/socket/in-call.ts):
 *   - `call:active-snapshot` {userIds[]} — sent socket-direct on connect;
 *     the initial roster of in-call users in the org.
 *   - `call:active` {userId, in_call} — broadcast to the org channel on
 *     0↔1 transitions for a user's in-call socket count.
 *
 * This pure handler surfaces both as callbacks. `useUsersInCall` composes
 * it with `useState` + `useSocketOptional` to drive a ReadonlySet<userId>.
 * Pure module (no React) keeps it node-env testable per the
 * [[pure-helper-extraction-pattern]] (Phase 7 #11 precedent).
 */
import { describe, expect, it, vi } from "vitest";

import {
  attachInCallHandlers,
  type MinimalInCallSocketTarget,
} from "@/lib/presence/in-call-handler";

function makeFakeSocket(): {
  socket: MinimalInCallSocketTarget;
  listeners: Map<string, Set<(...args: unknown[]) => void>>;
  emit: (event: string, ...args: unknown[]) => void;
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const loose = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const set = listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
      set.add(handler);
      listeners.set(event, set);
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
    },
  };
  const emit = (event: string, ...args: unknown[]) => {
    listeners.get(event)?.forEach((h) => {
      h(...args);
    });
  };
  return {
    socket: loose as unknown as MinimalInCallSocketTarget,
    listeners,
    emit,
  };
}

describe("attachInCallHandlers (client)", () => {
  it("registers listeners for call:active-snapshot and call:active", () => {
    const { socket, listeners } = makeFakeSocket();
    attachInCallHandlers(socket, {
      onRoster: () => undefined,
      onUpdate: () => undefined,
    });
    expect(listeners.get("call:active-snapshot")?.size).toBe(1);
    expect(listeners.get("call:active")?.size).toBe(1);
  });

  it("invokes onRoster with userIds when the server emits call:active-snapshot", () => {
    const { socket, emit } = makeFakeSocket();
    const onRoster = vi.fn();
    attachInCallHandlers(socket, {
      onRoster,
      onUpdate: () => undefined,
    });
    emit("call:active-snapshot", { userIds: ["user-a", "user-b"] });
    expect(onRoster).toHaveBeenCalledTimes(1);
    expect(onRoster).toHaveBeenCalledWith(["user-a", "user-b"]);
  });

  it("invokes onUpdate with (userId, in_call) when the server emits call:active", () => {
    const { socket, emit } = makeFakeSocket();
    const onUpdate = vi.fn();
    attachInCallHandlers(socket, {
      onRoster: () => undefined,
      onUpdate,
    });
    emit("call:active", { userId: "user-x", in_call: true });
    expect(onUpdate).toHaveBeenCalledWith("user-x", true);

    emit("call:active", { userId: "user-x", in_call: false });
    expect(onUpdate).toHaveBeenCalledWith("user-x", false);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("returns a disposer that removes both listeners", () => {
    const { socket, listeners, emit } = makeFakeSocket();
    const onRoster = vi.fn();
    const onUpdate = vi.fn();
    const dispose = attachInCallHandlers(socket, { onRoster, onUpdate });
    dispose();
    expect(listeners.get("call:active-snapshot")?.size).toBe(0);
    expect(listeners.get("call:active")?.size).toBe(0);
    emit("call:active-snapshot", { userIds: [] });
    emit("call:active", { userId: "x", in_call: true });
    expect(onRoster).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not invoke callbacks after dispose even if events fire later", () => {
    const { socket, emit } = makeFakeSocket();
    const onRoster = vi.fn();
    const onUpdate = vi.fn();
    const dispose = attachInCallHandlers(socket, { onRoster, onUpdate });

    emit("call:active", { userId: "user-y", in_call: true });
    expect(onUpdate).toHaveBeenCalledTimes(1);

    dispose();
    emit("call:active", { userId: "user-y", in_call: false });
    expect(onUpdate).toHaveBeenCalledTimes(1); // no new call after dispose
    void onRoster; // suppress unused
  });
});
