/**
 * Phase 7 #10 — `session:invalidated` listener helper.
 *
 * The Socket.IO server emits `session:invalidated` from the 60s revalidation
 * loop (apps/web/src/server/socket/revalidation.ts:77) immediately before
 * `socket.disconnect()` when a connected user's DB security_version no longer
 * matches the JWT version (role change, suspension, password reset).
 *
 * This helper attaches a listener that surfaces the event as a callback —
 * the provider injects `() => router.push('/login')`. Pure module (no React,
 * no Next.js router import) keeps it node-env testable per the
 * [[pure-helper-extraction-pattern]] established by Phase 7 #7c-2 and #8e.
 *
 * The `MinimalSocketEventTarget` shape narrows the surface intentionally —
 * we don't need the full TypedSocket here, just `on`/`off`. That lets tests
 * stub it with a hand-rolled fake socket and lets the runtime accept the
 * real TypedSocket without an explicit cast.
 */

export interface MinimalSocketEventTarget {
  on(event: "session:invalidated", handler: () => void): unknown;
  off(event: "session:invalidated", handler: () => void): unknown;
}

export type SessionInvalidationDisposer = () => void;

export function attachSessionInvalidationHandler(
  socket: MinimalSocketEventTarget,
  onInvalidated: () => void,
): SessionInvalidationDisposer {
  socket.on("session:invalidated", onInvalidated);
  return () => {
    socket.off("session:invalidated", onInvalidated);
  };
}
