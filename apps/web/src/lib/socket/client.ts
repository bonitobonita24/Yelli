/**
 * Phase 7 #10 — Socket.IO client factory.
 *
 * Pure wrapper around `socket.io-client`'s `io()` that enforces the Yelli
 * connection contract:
 *
 *   - withCredentials:true   — sends the Auth.js session cookie cross-origin.
 *                              The socket server runs on SOCKET_PORT (43515 in
 *                              dev), distinct from APP_PORT (43512); the two
 *                              are separate origins so the cookie only flows
 *                              with this flag. CORS on the server side is
 *                              already configured for env.NEXT_PUBLIC_APP_URL
 *                              with credentials:true (Phase 7 #8e-1 — see
 *                              apps/web/src/server/socket/server.ts:29).
 *
 *   - transports             — websocket-first with polling fallback for
 *                              corporate networks that block raw WS upgrade.
 *
 *   - reconnectionAttempts:5 — bounded so a dead server does not spin the
 *                              event loop forever. Matches usePresence's
 *                              existing budget (apps/web/src/lib/presence/
 *                              use-presence.ts:50).
 *
 * Kept React-free so it tests cleanly in node-env vitest without jsdom.
 * The provider (socket-context.tsx) consumes this + the session-invalidation
 * helper to compose the runtime client.
 */
import { io, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/lib/socket/types";

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface CreateSocketClientOptions {
  /** Absolute origin of the socket server (e.g. http://localhost:43515). */
  url: string;
  /**
   * Whether to connect immediately. Defaults to true. Set false for tests
   * or for callers that want to control connection timing (e.g. delay
   * until after hydration to avoid SSR/CSR mismatch).
   */
  autoConnect?: boolean;
}

export function createSocketClient(
  options: CreateSocketClientOptions,
): TypedSocket {
  const ioOptions: Partial<ManagerOptions & SocketOptions> = {
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnectionAttempts: 5,
    reconnectionDelay: 2_000,
    autoConnect: options.autoConnect ?? true,
  };

  return io(options.url, ioOptions) as TypedSocket;
}
