/**
 * Phase 7 #10 follow-up — `ensureSocketConnected` reconnect-on-mount guard.
 *
 * Pure-helper tests per the [[pure-helper-extraction-pattern]] established by
 * session-invalidation.test.ts. No React, no jsdom — a hand-rolled fake socket
 * asserts the contract:
 *
 *   1. If the socket is currently disconnected, call socket.connect().
 *   2. If the socket is already connected, do nothing.
 *
 * The motivating bug: `socket-context.tsx` useEffect cleanup calls
 * `socket.disconnect()` (intentional — needed on real unmount), but Socket.IO
 * does NOT auto-reconnect after an explicit `.disconnect()`. Under
 * `reactStrictMode: true`, React 18+ dev double-fires effects (mount →
 * cleanup → remount). The second mount re-runs the effect but the socket has
 * already been disconnected by the first cleanup. HMR / route remounts hit
 * the same shape. Result: a permanently-dead socket for the rest of the
 * session, silently breaking presence + incoming-call delivery.
 *
 * Lesson: [[strictmode-socket-disconnect-permanent]] — any subscribed
 * transport that is explicitly torn down in cleanup needs a matching
 * mount-side recovery, because cleanup runs once per StrictMode dev cycle.
 */
import { describe, expect, it } from "vitest";

import {
  ensureSocketConnected,
  type ReconnectableSocket,
} from "@/lib/socket/ensure-connected";

function makeFakeSocket(disconnected: boolean): {
  socket: ReconnectableSocket;
  connectCalls: number;
} {
  const state = { connectCalls: 0 };
  const socket: ReconnectableSocket = {
    disconnected,
    connect: () => {
      state.connectCalls += 1;
    },
  };
  return {
    socket,
    get connectCalls() {
      return state.connectCalls;
    },
  };
}

describe("ensureSocketConnected", () => {
  it("calls socket.connect() when the socket is currently disconnected", () => {
    const fake = makeFakeSocket(true);
    ensureSocketConnected(fake.socket);
    expect(fake.connectCalls).toBe(1);
  });

  it("does NOT call socket.connect() when the socket is already connected", () => {
    const fake = makeFakeSocket(false);
    ensureSocketConnected(fake.socket);
    expect(fake.connectCalls).toBe(0);
  });

  it("returns undefined (void contract — caller does not need a value)", () => {
    const fake = makeFakeSocket(true);
    const result = ensureSocketConnected(fake.socket);
    expect(result).toBeUndefined();
  });
});
