/**
 * Phase 7 #11 — user-level presence engine.
 *
 * The auth-gated Socket.IO server tracks online state PER USER PER ORG. A
 * single user with multiple browser tabs has multiple sockets, but only one
 * "online" transition; this module coalesces the lifecycle so we emit exactly
 * one `presence:user` broadcast per real online/offline transition.
 *
 * In-memory store: Map<orgId, Map<userId, Set<socketId>>>. Sufficient for
 * single-process deployments (current Yelli env). When Phase 6 adds the Redis
 * adapter for multi-instance, this state needs to migrate to a shared store
 * (Valkey hash) keyed by orgId — the roster API stays the same; the impl
 * swaps. The disconnect-emit-if-isLast contract still holds because the
 * adapter's broadcast semantics deliver the emit to all instances.
 *
 * Channel naming follows the org-scoped helper (`channels.ts`): the room
 * `${orgId}:presence:user` is joined by every authenticated socket in the
 * org. Cross-org subscription is prevented by `joinOrgChannel` sourcing the
 * org id from `socket.data.session`; a malicious client cannot coerce
 * joining another org's room through any helper exposed here. Server-side
 * code that initiates emits (e.g. external admin actions in future tickets)
 * uses `emitToOrg` and supplies the org id explicitly.
 *
 * The roster is intentionally a separate concern from `attachPresenceHandlers`:
 * - `createPresenceRoster()` is pure state (no I/O, fully unit-testable)
 * - `attachPresenceHandlers({io, socket, roster})` is the wiring layer
 * Tests cover both. See presence.test.ts for the contract specification.
 *
 * Snapshot includes the user themselves — simpler than filtering and matches
 * the "real-time online indicator" UX where you can verify you're connected
 * by seeing yourself in the roster.
 */
import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

const PRESENCE_USER_EVENT = "presence:user";
const PRESENCE_SNAPSHOT_EVENT = "presence:snapshot";

export interface PresenceRoster {
  /** Add a socket to the roster. `wasFirst` ↔ 0→1 transition for that user. */
  addSocket(
    orgId: string,
    userId: string,
    socketId: string,
  ): { wasFirst: boolean };
  /** Remove a socket. `isLast` ↔ 1→0 transition for that user. */
  removeSocket(
    orgId: string,
    userId: string,
    socketId: string,
  ): { isLast: boolean };
  /** Snapshot of currently-online user ids for an org. */
  getOnlineUsers(orgId: string): string[];
}

export function createPresenceRoster(): PresenceRoster {
  const orgs = new Map<string, Map<string, Set<string>>>();

  function getOrgMap(orgId: string): Map<string, Set<string>> {
    let m = orgs.get(orgId);
    if (!m) {
      m = new Map();
      orgs.set(orgId, m);
    }
    return m;
  }

  return {
    addSocket(orgId, userId, socketId) {
      const orgMap = getOrgMap(orgId);
      let sockets = orgMap.get(userId);
      if (!sockets) {
        sockets = new Set();
        orgMap.set(userId, sockets);
      }
      const wasFirst = sockets.size === 0;
      sockets.add(socketId);
      return { wasFirst };
    },
    removeSocket(orgId, userId, socketId) {
      const orgMap = orgs.get(orgId);
      if (!orgMap) return { isLast: false };
      const sockets = orgMap.get(userId);
      if (!sockets) return { isLast: false };
      const hadIt = sockets.delete(socketId);
      if (!hadIt) return { isLast: false };
      const isLast = sockets.size === 0;
      if (isLast) {
        orgMap.delete(userId);
        if (orgMap.size === 0) orgs.delete(orgId);
      }
      return { isLast };
    },
    getOnlineUsers(orgId) {
      const orgMap = orgs.get(orgId);
      if (!orgMap) return [];
      return [...orgMap.keys()];
    },
  };
}

/**
 * Wire presence lifecycle onto an authenticated socket. Call once per
 * connection — typically from `io.on("connection", socket => …)`.
 *
 * Defensive: if `socket.data.session` is missing (which should never happen
 * post-auth-middleware), the function returns without joining/emitting/
 * registering. This mirrors the guard in `channels.joinOrgChannel`.
 */
export function attachPresenceHandlers(args: {
  io: IOServer;
  socket: Socket;
  roster: PresenceRoster;
}): void {
  const { io, socket, roster } = args;
  const session = socket.data.session as SocketSession | undefined;
  if (!session) return;

  const { organizationId, userId } = session;

  joinOrgChannel(socket, PRESENCE_USER_EVENT);

  const { wasFirst } = roster.addSocket(organizationId, userId, socket.id);
  if (wasFirst) {
    emitToOrg(io, organizationId, PRESENCE_USER_EVENT, {
      userId,
      online: true,
    });
  }

  socket.emit(PRESENCE_SNAPSHOT_EVENT, {
    userIds: roster.getOnlineUsers(organizationId),
  });

  socket.on("disconnect", () => {
    const { isLast } = roster.removeSocket(organizationId, userId, socket.id);
    if (isLast) {
      emitToOrg(io, organizationId, PRESENCE_USER_EVENT, {
        userId,
        online: false,
      });
    }
  });
}
