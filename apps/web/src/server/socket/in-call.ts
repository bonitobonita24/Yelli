/**
 * Phase 7 #14 — in-call roster + handler attach.
 *
 * Twin-roster parallel to `presence.ts`. The roster tracks which (org, user)
 * pairs currently have at least one socket reporting an active LiveKit room
 * participation. The handler wires the client-emitted `call:joined`/
 * `call:left` events onto the roster and broadcasts `call:active`
 * org-scoped on 0↔1 transitions.
 *
 * Source of truth: the browser. LiveKit Room.Connected → `socket.emit("call:joined")`;
 * Room.Disconnected → `socket.emit("call:left")`. Socket disconnect cleanup
 * catches crashed/closed browsers. See the locked design decisions in
 * `docs/superpowers/specs/2026-05-17-in-call-state-design.md`.
 *
 * Process-local Map state — single-instance only. When Phase 6 introduces the
 * Redis adapter for multi-instance, this swaps to a Valkey hash keyed by orgId
 * with the same `{wasFirst}/{isLast}` contract.
 *
 * Cross-org isolation: `joinOrgChannel(socket, "call:active")` sources orgId
 * from `socket.data.session` (auth middleware in Phase 7 #8e-1). The roster
 * itself is keyed by orgId; a malicious socket cannot inject entries for
 * another org because addSocket only fires from the authenticated handler.
 */
import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

const CALL_ACTIVE_EVENT = "call:active";
const CALL_SNAPSHOT_EVENT = "call:active-snapshot";

export interface InCallRoster {
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
  /** Snapshot of currently-in-call user ids for an org. */
  getInCallUsers(orgId: string): string[];
}

export function createInCallRoster(): InCallRoster {
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
    getInCallUsers(orgId) {
      const orgMap = orgs.get(orgId);
      if (!orgMap) return [];
      return Array.from(orgMap.keys());
    },
  };
}

/**
 * Wire in-call lifecycle onto an authenticated socket. Call once per
 * connection — typically from `io.on("connection", socket => …)`.
 *
 * Defensive: if `socket.data.session` is missing (which should never happen
 * post-auth-middleware), the function returns without joining/emitting/
 * registering. Mirrors the guard in `attachPresenceHandlers`.
 */
export function attachInCallHandlers(args: {
  io: IOServer;
  socket: Socket;
  roster: InCallRoster;
}): void {
  const { io, socket, roster } = args;
  const session = socket.data.session as SocketSession | undefined;
  if (!session) return;

  const { organizationId, userId } = session;

  joinOrgChannel(socket, CALL_ACTIVE_EVENT);

  socket.emit(CALL_SNAPSHOT_EVENT, {
    userIds: roster.getInCallUsers(organizationId),
  });

  socket.on("call:joined", () => {
    const { wasFirst } = roster.addSocket(organizationId, userId, socket.id);
    if (wasFirst) {
      emitToOrg(io, organizationId, CALL_ACTIVE_EVENT, {
        userId,
        in_call: true,
      });
    }
  });

  socket.on("call:left", () => {
    const { isLast } = roster.removeSocket(organizationId, userId, socket.id);
    if (isLast) {
      emitToOrg(io, organizationId, CALL_ACTIVE_EVENT, {
        userId,
        in_call: false,
      });
    }
  });

  socket.on("disconnect", () => {
    const { isLast } = roster.removeSocket(organizationId, userId, socket.id);
    if (isLast) {
      emitToOrg(io, organizationId, CALL_ACTIVE_EVENT, {
        userId,
        in_call: false,
      });
    }
  });
}
