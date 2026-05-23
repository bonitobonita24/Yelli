/**
 * socket/server singleton — survives webpack module duplication.
 *
 * Background (see lessons.md [[webpack-module-duplication-singleton-trap]]):
 * Next.js + webpack bundles `apps/web/src/server/socket/server.ts` into TWO
 * compiled chunks because instrumentation.ts uses a DYNAMIC `await import()`
 * while tRPC routers use a STATIC `import { getIO }`. Tree-shaking gives the
 * route chunk a stripped copy that has `getIO` but never sees the `ioInstance`
 * the instrumentation chunk's copy assigned at boot. With a module-local
 * `let ioInstance`, `getIO()` from the route side returned null forever, and
 * the `if (io !== null)` guard in calls.ts silently swallowed every
 * org-scoped emit (call:incoming never reached any recipient socket).
 *
 * Fix: hoist the singleton to `globalThis[Symbol.for("yelli.socket.io")]`.
 * `Symbol.for(...)` returns the same symbol value across realms and module
 * copies, so both compiled chunks read/write the same slot.
 *
 * These tests simulate the webpack two-copies scenario via vi.resetModules().
 */
import { createServer as createHttpServer } from "http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Server as HttpServer } from "http";
import type { Server as IOServer } from "socket.io";

const IO_SYMBOL = Symbol.for("yelli.socket.io");

function readSlot(): IOServer | null {
  return (globalThis as { [k: symbol]: IOServer | undefined })[IO_SYMBOL] ?? null;
}

function clearSlot(): void {
  delete (globalThis as { [k: symbol]: IOServer | undefined })[IO_SYMBOL];
}

describe("socket/server singleton", () => {
  let httpServer: HttpServer;

  beforeEach(() => {
    clearSlot();
    httpServer = createHttpServer();
  });

  afterEach(async () => {
    const io = readSlot();
    if (io) {
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    }
    clearSlot();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    vi.resetModules();
  });

  it("getIO returns null before createSocketServer is called", async () => {
    const { getIO } = await import("@/server/socket/server");
    expect(getIO()).toBeNull();
  });

  it("getIO returns the io after createSocketServer", async () => {
    const { createSocketServer, getIO } = await import("@/server/socket/server");
    const io = createSocketServer(httpServer);
    expect(getIO()).toBe(io);
  });

  it("stores the io on globalThis under Symbol.for('yelli.socket.io')", async () => {
    const { createSocketServer } = await import("@/server/socket/server");
    const io = createSocketServer(httpServer);
    expect(readSlot()).toBe(io);
  });

  it("survives module duplication: getIO from a separately-loaded module copy sees the io set by another copy", async () => {
    // Simulates Next.js + webpack splitting server.ts into two chunks —
    // instrumentation chunk creates the io, route chunk later calls getIO.
    // vi.resetModules() forces a fresh re-evaluation on the next import,
    // mirroring webpack producing a second compiled copy of the module.
    const copyA = await import("@/server/socket/server");
    const io = copyA.createSocketServer(httpServer);

    vi.resetModules();
    const copyB = await import("@/server/socket/server");

    // Sanity: the two copies are distinct module instances (different
    // function identities) — proves vi.resetModules actually re-evaluated.
    expect(copyB.getIO).not.toBe(copyA.getIO);

    // The bug pre-fix: copyB.getIO() returns null because its module-local
    // ioInstance was never assigned (only copy A's was). Post-fix: both
    // copies read the same globalThis Symbol slot.
    expect(copyB.getIO()).toBe(io);
  });

  it("createSocketServer is idempotent across module copies — second call from a fresh copy returns the existing io, does not rebuild", async () => {
    const copyA = await import("@/server/socket/server");
    const io1 = copyA.createSocketServer(httpServer);

    vi.resetModules();
    const copyB = await import("@/server/socket/server");

    // A route-chunk copy might also call createSocketServer if some code
    // path accidentally invokes it. Must NOT orphan the live io by binding
    // to a different httpServer.
    const httpServer2 = createHttpServer();
    try {
      const io2 = copyB.createSocketServer(httpServer2);
      expect(io2).toBe(io1);
    } finally {
      await new Promise<void>((resolve) => {
        httpServer2.close(() => resolve());
      });
    }
  });
});
