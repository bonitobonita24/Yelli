// Non-tRPC: Socket.IO singleton — manual auth required on each connection.
// Real WebSocket upgrade is handled by a custom HTTP server in Phase 6.
// This module manages the singleton IOServer instance across HMR restarts.


import { Server as IOServer } from "socket.io";

import { clientEnv } from "@/env";

import {
  callIncomingRoom,
  callerRoom,
} from "./types";

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types";
import type { IncomingCallPayload } from "@/lib/livekit/types";
import type { Server as HTTPServer } from "node:http";

// ---------------------------------------------------------------------------
// Typed IOServer alias
// ---------------------------------------------------------------------------

type AppIOServer = IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ---------------------------------------------------------------------------
// globalThis singleton — survives Next.js HMR without double-init
// ---------------------------------------------------------------------------

const globalForIO = globalThis as typeof globalThis & {
  __ioServer?: AppIOServer;
};

/** Returns the live IOServer instance, or null if not yet initialised. */
export function getIO(): AppIOServer | null {
  return globalForIO.__ioServer ?? null;
}

/**
 * Attaches a Socket.IO server to the given HTTP server.
 * Idempotent — safe to call multiple times; only one instance is ever created.
 */
export function initSocketServer(httpServer: HTTPServer): AppIOServer {
  if (globalForIO.__ioServer) {
    return globalForIO.__ioServer;
  }

  const io = new IOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    path: "/api/socket",
    cors: {
      origin: clientEnv.NEXT_PUBLIC_APP_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Phase 6 will swap this for a cluster-compatible adapter (e.g. socket.io-redis)
    transports: ["websocket", "polling"],
  });

  // TODO (Phase 6): Add socket auth middleware that validates session cookie.
  // io.use(async (socket, next) => {
  //   const session = await getServerSession(authOptions);
  //   if (!session) return next(new Error("Unauthorized"));
  //   socket.data.userId = session.user.id;
  //   socket.data.organizationId = session.user.organizationId;
  //   socket.data.subscribedDepartmentIds = new Set();
  //   next();
  // });

  io.on("connection", (socket) => {
    attachConnectionHandlers(io, socket);
  });

  globalForIO.__ioServer = io;
  return io;
}

// ---------------------------------------------------------------------------
// Per-connection event handlers
// ---------------------------------------------------------------------------

function attachConnectionHandlers(
  io: AppIOServer,
  socket: ReturnType<AppIOServer["sockets"]["sockets"]["get"]> extends
    | infer S
    | undefined
    ? NonNullable<S>
    : never,
): void {
  // Subscribe caller to department presence rooms so they receive updates.
  socket.on("presence:subscribe", (departmentIds) => {
    if (!Array.isArray(departmentIds)) return;
    for (const id of departmentIds) {
      if (typeof id === "string" && id.length > 0) {
        void socket.join(`presence:dept:${id}`);
        socket.data.subscribedDepartmentIds?.add(id);
      }
    }
  });

  // Heartbeat — client keeps its own presence alive.
  socket.on("presence:heartbeat", () => {
    // Extend TTL on server-side presence store (Phase 6 Valkey integration).
  });

  // Relay call rejection to the original caller's private room.
  socket.on("call:reject", ({ callId }) => {
    if (typeof callId !== "string" || callId.length === 0) return;
    // The callId encodes the caller userId in the format used by the calls router.
    // For now emit to the caller room that is set when initiate is called.
    io.to(`call:reject:${callId}`).emit("call:rejected", {
      callId,
      reason: "declined",
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers used by tRPC routers
// ---------------------------------------------------------------------------

/**
 * Emits a `call:incoming` event to the recipient department room and subscribes
 * the caller to a private room so they can receive rejection notifications.
 */
export function emitIncomingCall(
  io: AppIOServer,
  {
    callerUserId,
    recipientOrgId,
    recipientDeptId,
    payload,
  }: {
    callerUserId: string;
    recipientOrgId: string;
    recipientDeptId: string;
    payload: IncomingCallPayload;
  },
): void {
  const room = callIncomingRoom(recipientOrgId, recipientDeptId);
  io.to(room).emit("call:incoming", payload);

  // Put the caller's sockets into a private room so rejection events reach them.
  const callerSocketRoom = callerRoom(callerUserId);
  void io.in(callerSocketRoom).socketsJoin(`call:reject:${payload.callId}`);
}
