/**
 * Phase 7 #11 — pure handler for the user-level presence engine.
 *
 * The auth-gated Socket.IO server (apps/web/src/server/socket/presence.ts)
 * emits two events for user-level org presence:
 *
 *   - `presence:snapshot` {userIds[]} — socket-direct on connect; the initial
 *     roster of online users in the org.
 *   - `presence:user` {userId, online} — broadcast to the org channel when a
 *     user's online socket count transitions 0↔1.
 *
 * This module exposes them as plain callbacks via `attachUserPresenceHandlers`.
 * `useUserPresence` (apps/web/src/lib/presence/use-user-presence.ts) composes
 * it with `useState` + `useSocketOptional()` to drive a per-userId boolean
 * map. Pure module — no React, no Next.js — node-testable per the
 * [[pure-helper-extraction-pattern]] (Phase 7 #7c-2 / #8e / #10).
 *
 * The `MinimalSocketEventTarget` shape narrows the surface to just `on`/`off`
 * with the two event names. The real TypedSocket from `@/lib/socket/client`
 * satisfies this contract without an explicit cast; tests stub it with a
 * hand-rolled fake.
 */

export interface PresenceSnapshotPayload {
  userIds: string[];
}

export interface PresenceUserPayload {
  userId: string;
  online: boolean;
}

export interface MinimalSocketEventTarget {
  on(
    event: "presence:snapshot",
    handler: (payload: PresenceSnapshotPayload) => void,
  ): unknown;
  on(
    event: "presence:user",
    handler: (payload: PresenceUserPayload) => void,
  ): unknown;
  off(
    event: "presence:snapshot",
    handler: (payload: PresenceSnapshotPayload) => void,
  ): unknown;
  off(
    event: "presence:user",
    handler: (payload: PresenceUserPayload) => void,
  ): unknown;
}

export interface UserPresenceCallbacks {
  /** Replace the local online-user set with the server's snapshot. */
  onRoster: (userIds: string[]) => void;
  /** Patch the local map for a single user's online/offline transition. */
  onUpdate: (userId: string, online: boolean) => void;
}

export type UserPresenceDisposer = () => void;

export function attachUserPresenceHandlers(
  socket: MinimalSocketEventTarget,
  callbacks: UserPresenceCallbacks,
): UserPresenceDisposer {
  const onSnapshot = (payload: PresenceSnapshotPayload): void => {
    callbacks.onRoster(payload.userIds);
  };
  const onUser = (payload: PresenceUserPayload): void => {
    callbacks.onUpdate(payload.userId, payload.online);
  };

  socket.on("presence:snapshot", onSnapshot);
  socket.on("presence:user", onUser);

  return () => {
    socket.off("presence:snapshot", onSnapshot);
    socket.off("presence:user", onUser);
  };
}
