/**
 * Socket.IO server factory.
 *
 * Called by `apps/web/src/instrumentation.ts` (Next.js 15 instrumentation
 * hook) at process start. Attaches the auth middleware so every handshake
 * is verified before a connection is granted (Phase 7 #8e-1). Channel
 * naming and the 60s session-revalidation loop land in e-2.
 *
 * Hosting topology (locked Phase 7 #8e-1 — option B): instrumentation.ts
 * boots a SEPARATE HTTP server on SOCKET_PORT, distinct from the Next.js
 * HTTP server on APP_PORT. This keeps `next start` and `output: standalone`
 * Docker builds unchanged; CORS lets the Next.js origin connect to the
 * separate port.
 *
 * Singleton storage: the io reference lives on
 * `globalThis[Symbol.for("yelli.socket.io")]`, NOT a module-local `let`.
 * Reason: Next.js + webpack bundles this file into two compiled chunks —
 * instrumentation.ts uses `await import(...)` (instrumentation chunk),
 * tRPC routers use `import { getIO }` (route chunk). Tree-shaking gives
 * the route chunk a stripped copy whose module-local `ioInstance` is never
 * assigned, so `getIO()` from the route side would return null forever and
 * every `emitToOrg(...)` silently no-ops. `Symbol.for(...)` returns the same
 * symbol value across module copies, so both chunks read/write one slot.
 * See lessons.md [[webpack-module-duplication-singleton-trap]] +
 * [[webpack-define-plugin-trap]] for the broader trap family.
 */
import { Server as IOServer } from "socket.io";


import { env } from "@/env";
import { socketAuthMiddleware } from "@/server/socket/auth";
import { attachCallHandlers } from "@/server/socket/calls";
import {
  attachInCallHandlers,
  createInCallRoster,
} from "@/server/socket/in-call";
import {
  attachPresenceHandlers,
  createPresenceRoster,
} from "@/server/socket/presence";

import type { Server as HttpServer } from "http";

const IO_SYMBOL = Symbol.for("yelli.socket.io");

type GlobalWithIO = typeof globalThis & {
  [IO_SYMBOL]?: IOServer;
};

export function getIO(): IOServer | null {
  return (globalThis as GlobalWithIO)[IO_SYMBOL] ?? null;
}

export function createSocketServer(httpServer: HttpServer): IOServer {
  // Idempotent on Next.js dev HMR re-execution of instrumentation.ts AND
  // across webpack-duplicated module copies (the route chunk's copy of this
  // file may also reach this function under unexpected code paths — it must
  // return the live io rather than build a second one bound to a different
  // httpServer, which would orphan every existing connection).
  const existing = getIO();
  if (existing !== null) return existing;

  const io = new IOServer(httpServer, {
    cors: {
      // The Next.js app on APP_PORT (or the prod domain) is the only client
      // that should ever connect. credentials:true lets the browser send the
      // Auth.js session cookie cross-origin (separate ports = separate origins).
      origin: env.NEXT_PUBLIC_APP_URL,
      credentials: true,
    },
    // Heartbeat tuned to security.md §Realtime Connection Safety (30s).
    // Server-side default pingInterval is 25s; pingTimeout 20s. The 30s
    // declared in DECISIONS_LOG.md line 173 governs application-level
    // re-validation, not transport ping — kept distinct for clarity.
    transports: ["websocket", "polling"],
  });

  // Expose singleton on globalThis so the tRPC side (calls.initiate) can
  // broadcast via emitToOrg even when its copy of this module was bundled
  // into a different webpack chunk than the instrumentation copy.
  (globalThis as GlobalWithIO)[IO_SYMBOL] = io;

  io.use((socket, next) => {
    socketAuthMiddleware(socket, next).catch((err: unknown) => {
      // Defensive: socketAuthMiddleware already catches decode errors and
      // calls next(err). Any unexpected throw here is logged and rejected.
      const message = err instanceof Error ? err.message : "INTERNAL_ERROR";
      next(new Error(message));
    });
  });

  // Phase 7 #11 — user-level presence engine. The roster is process-local
  // in-memory; single-instance dev/staging/prod is fine. Phase 6 Redis adapter
  // migration will swap the impl behind the same API. See presence.ts for the
  // contract and the multi-tab coalescing semantics.
  const presenceRoster = createPresenceRoster();

  // Phase 7 #14 — in-call state engine. Parallel roster + handler structure;
  // see in-call.ts and docs/superpowers/specs/2026-05-17-in-call-state-design.md.
  // Same single-instance assumption + Redis adapter migration path as presence.
  const inCallRoster = createInCallRoster();

  io.on("connection", (socket) => {
    attachPresenceHandlers({ io, socket, roster: presenceRoster });
    attachInCallHandlers({ io, socket, roster: inCallRoster });
    attachCallHandlers({ io, socket });
  });

  return io;
}
