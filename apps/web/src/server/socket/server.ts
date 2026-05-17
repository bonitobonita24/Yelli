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
 */
import { Server as IOServer } from "socket.io";


import { env } from "@/env";
import { socketAuthMiddleware } from "@/server/socket/auth";
import {
  attachPresenceHandlers,
  createPresenceRoster,
} from "@/server/socket/presence";

import type { Server as HttpServer } from "http";

export function createSocketServer(httpServer: HttpServer): IOServer {
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
  io.on("connection", (socket) => {
    attachPresenceHandlers({ io, socket, roster: presenceRoster });
  });

  return io;
}
