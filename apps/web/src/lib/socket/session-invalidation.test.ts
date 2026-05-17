/**
 * Phase 7 #10 — `attachSessionInvalidationHandler` unit tests.
 *
 * The Socket.IO server emits `session:invalidated` from the 60s revalidation
 * loop (apps/web/src/server/socket/revalidation.ts:77) immediately before
 * `socket.disconnect()` when a connected user's DB security_version no longer
 * matches the JWT version (role change, suspension, password reset). This
 * helper attaches a listener that surfaces that event to the React layer as
 * a forced re-auth callback.
 *
 * Pure helper — no React, no Next.js router import — so node-env vitest tests
 * it directly. Provider (socket-context.tsx) injects `router.push('/login')`
 * as the callback. Matches [[pure-helper-extraction-pattern]] from Phase 7
 * #7c-2 + #8e: Edge-incompatible / runtime-dependent wiring stays in the
 * provider; testable behaviour lives in a separate module.
 */
import { describe, expect, it, vi } from "vitest";

import { attachSessionInvalidationHandler } from "@/lib/socket/session-invalidation";

interface MinimalSocket {
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
}

function makeFakeSocket(): {
  socket: MinimalSocket;
  listeners: Map<string, Set<() => void>>;
  emit: (event: string) => void;
} {
  const listeners = new Map<string, Set<() => void>>();
  const socket: MinimalSocket = {
    on: (event, handler) => {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
    },
    off: (event, handler) => {
      listeners.get(event)?.delete(handler);
    },
  };
  const emit = (event: string) => {
    listeners.get(event)?.forEach((h) => {
      h();
    });
  };
  return { socket, listeners, emit };
}

describe("attachSessionInvalidationHandler", () => {
  it("registers a listener for the session:invalidated event", () => {
    const { socket, listeners } = makeFakeSocket();
    attachSessionInvalidationHandler(socket, () => undefined);
    expect(listeners.get("session:invalidated")?.size).toBe(1);
  });

  it("invokes the callback when the server emits session:invalidated", () => {
    const { socket, emit } = makeFakeSocket();
    const onInvalidated = vi.fn();
    attachSessionInvalidationHandler(socket, onInvalidated);
    emit("session:invalidated");
    expect(onInvalidated).toHaveBeenCalledTimes(1);
  });

  it("returns a disposer that removes the listener", () => {
    const { socket, listeners, emit } = makeFakeSocket();
    const onInvalidated = vi.fn();
    const dispose = attachSessionInvalidationHandler(socket, onInvalidated);
    dispose();
    expect(listeners.get("session:invalidated")?.size).toBe(0);
    emit("session:invalidated");
    expect(onInvalidated).not.toHaveBeenCalled();
  });

  it("does not fire the callback for unrelated events", () => {
    const { socket, emit } = makeFakeSocket();
    const onInvalidated = vi.fn();
    attachSessionInvalidationHandler(socket, onInvalidated);
    emit("connect");
    emit("disconnect");
    emit("call:incoming");
    expect(onInvalidated).not.toHaveBeenCalled();
  });
});
