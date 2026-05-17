/**
 * Phase 7 #14 — pure handler for the in-call state engine (client side).
 *
 * The auth-gated Socket.IO server (apps/web/src/server/socket/in-call.ts)
 * emits two events for in-call state:
 *
 *   - `call:active-snapshot` {userIds[]} — socket-direct on connect; the
 *     initial roster of in-call users in the org.
 *   - `call:active` {userId, in_call} — broadcast to the org channel on
 *     0↔1 transitions for a user's in-call socket count.
 *
 * This module exposes them as plain callbacks via `attachInCallHandlers`.
 * `useUsersInCall` (apps/web/src/lib/presence/use-users-in-call.ts) composes
 * it with `useState` + `useSocketOptional()` to drive a ReadonlySet<userId>.
 * Pure module — no React, no Next.js — node-testable per the
 * [[pure-helper-extraction-pattern]] (Phase 7 #11 precedent).
 *
 * Mirrors `user-presence-handler.ts` byte-for-byte in structure — the only
 * differences are event names and payload field names.
 */

export interface InCallSnapshotPayload {
  userIds: string[];
}

export interface InCallUpdatePayload {
  userId: string;
  in_call: boolean;
}

export interface MinimalInCallSocketTarget {
  on(
    event: "call:active-snapshot",
    handler: (payload: InCallSnapshotPayload) => void,
  ): unknown;
  on(
    event: "call:active",
    handler: (payload: InCallUpdatePayload) => void,
  ): unknown;
  off(
    event: "call:active-snapshot",
    handler: (payload: InCallSnapshotPayload) => void,
  ): unknown;
  off(
    event: "call:active",
    handler: (payload: InCallUpdatePayload) => void,
  ): unknown;
}

export interface InCallCallbacks {
  /** Replace the local in-call user set with the server's snapshot. */
  onRoster: (userIds: string[]) => void;
  /** Patch the local set for a single user's in-call transition. */
  onUpdate: (userId: string, in_call: boolean) => void;
}

export type InCallDisposer = () => void;

export function attachInCallHandlers(
  socket: MinimalInCallSocketTarget,
  callbacks: InCallCallbacks,
): InCallDisposer {
  const onSnapshot = (payload: InCallSnapshotPayload): void => {
    callbacks.onRoster(payload.userIds);
  };
  const onUpdate = (payload: InCallUpdatePayload): void => {
    callbacks.onUpdate(payload.userId, payload.in_call);
  };

  socket.on("call:active-snapshot", onSnapshot);
  socket.on("call:active", onUpdate);

  return () => {
    socket.off("call:active-snapshot", onSnapshot);
    socket.off("call:active", onUpdate);
  };
}
