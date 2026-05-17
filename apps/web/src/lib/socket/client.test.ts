/**
 * Phase 7 #10 — Socket.IO client factory.
 *
 * `createSocketClient` is a pure wrapper around `socket.io-client`'s `io()`
 * that enforces the Yelli connection contract: `withCredentials: true` so
 * the browser sends the Auth.js cookie cross-origin (separate ports = separate
 * origins per Phase 7 #8e option B), explicit transports, and bounded
 * reconnection. Factory style (no React) keeps it testable in node-env vitest
 * without jsdom — provider integration is tested via the pure invalidation
 * helper (session-invalidation.test.ts) per [[pure-helper-extraction-pattern]].
 */
import { io } from "socket.io-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSocketClient } from "@/lib/socket/client";

// Vitest hoists vi.mock above all imports — placement here is cosmetic for
// the import/order rule. Matches the pattern in src/server/socket/auth.test.ts.
vi.mock("socket.io-client", () => ({
  io: vi.fn(),
}));

describe("createSocketClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls io() with the given URL", () => {
    createSocketClient({ url: "http://localhost:43515" });
    expect(io).toHaveBeenCalledTimes(1);
    expect(vi.mocked(io).mock.calls[0]?.[0]).toBe("http://localhost:43515");
  });

  it("sets withCredentials:true so the Auth.js cookie flows cross-origin", () => {
    createSocketClient({ url: "http://localhost:43515" });
    const opts = vi.mocked(io).mock.calls[0]?.[1] ?? {};
    expect(opts.withCredentials).toBe(true);
  });

  it("uses websocket + polling transports for fallback compatibility", () => {
    createSocketClient({ url: "http://localhost:43515" });
    const opts = vi.mocked(io).mock.calls[0]?.[1] ?? {};
    expect(opts.transports).toEqual(["websocket", "polling"]);
  });

  it("caps reconnection attempts so a dead server does not spin forever", () => {
    createSocketClient({ url: "http://localhost:43515" });
    const opts = vi.mocked(io).mock.calls[0]?.[1] ?? {};
    expect(opts.reconnectionAttempts).toBeGreaterThan(0);
    expect(opts.reconnectionAttempts).toBeLessThanOrEqual(10);
  });

  it("defaults autoConnect to true (provider mounts and connects)", () => {
    createSocketClient({ url: "http://localhost:43515" });
    const opts = vi.mocked(io).mock.calls[0]?.[1] ?? {};
    // autoConnect undefined → io defaults to true; we either omit or pass true
    expect(opts.autoConnect ?? true).toBe(true);
  });

  it("respects autoConnect override (false for SSR-safe mount)", () => {
    createSocketClient({ url: "http://localhost:43515", autoConnect: false });
    const opts = vi.mocked(io).mock.calls[0]?.[1] ?? {};
    expect(opts.autoConnect).toBe(false);
  });
});
