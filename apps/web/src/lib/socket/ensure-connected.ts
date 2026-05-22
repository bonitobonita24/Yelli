/**
 * Phase 7 #10 follow-up — `ensureSocketConnected` reconnect-on-mount guard.
 *
 * Calls `socket.connect()` if the socket is currently disconnected; no-op
 * otherwise. Invoked at the top of `SocketProvider`'s useEffect so that React
 * StrictMode's dev double-fire (mount → cleanup → remount) — which runs the
 * cleanup's `socket.disconnect()` between the two mounts — does NOT leave the
 * socket permanently dead. Socket.IO's `reconnectionAttempts` budget only
 * applies to transport-level drops; an explicit `.disconnect()` is treated as
 * intentional and is never auto-recovered. See
 * apps/web/src/lib/socket/client.ts for the `reconnectionAttempts: 5` policy
 * that this guard complements (it does not replace it).
 *
 * Pure module — node-testable via the [[pure-helper-extraction-pattern]]
 * established by session-invalidation.ts. The `ReconnectableSocket` shape
 * narrows the surface to exactly what we touch; a real `TypedSocket` (from
 * `client.ts`) satisfies it without a cast, and tests stub it with a
 * hand-rolled fake.
 */

export interface ReconnectableSocket {
  readonly disconnected: boolean;
  connect(): unknown;
}

export function ensureSocketConnected(socket: ReconnectableSocket): void {
  if (socket.disconnected) {
    socket.connect();
  }
}
