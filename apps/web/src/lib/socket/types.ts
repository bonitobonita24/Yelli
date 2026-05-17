import type { IncomingCallPayload } from "@/lib/livekit/types";
import type { PresenceState } from "@/lib/presence/types";

export interface ServerToClientEvents {
  "call:incoming": (payload: IncomingCallPayload) => void;
  "call:rejected": (payload: {
    callId: string;
    reason: "declined" | "unavailable";
  }) => void;
  // Legacy Phase 5b — emitted by the /api/socket path (lib/socket/server.ts).
  // Kept for backwards type compatibility while the legacy server still ships;
  // department-binding ticket will reshape or retire this once the new
  // user-level engine fully replaces it.
  "presence:update": (payload: {
    departmentId: string;
    state: PresenceState;
  }) => void;
  // Phase 7 #11 — user-level presence on the auth-gated server (server/socket).
  // `presence:user` broadcasts a single user's online state transition (0↔1
  // sockets in the roster); `presence:snapshot` is sent socket-direct on
  // connect with the initial roster of online users in the org. See
  // apps/web/src/server/socket/presence.ts.
  "presence:user": (payload: { userId: string; online: boolean }) => void;
  "presence:snapshot": (payload: { userIds: string[] }) => void;
  // Phase 7 #8e-2 — emitted by the 60s revalidation loop immediately before
  // socket.disconnect() when DB security_version no longer matches the JWT
  // version (role change, suspension, password reset). The client surfaces
  // this as a forced re-auth UX (redirect to /login) via Phase 7 #10's
  // SocketProvider.
  "session:invalidated": () => void;
}

export interface ClientToServerEvents {
  "presence:subscribe": (departmentIds: string[]) => void;
  "presence:heartbeat": () => void;
  "call:reject": (payload: { callId: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  organizationId: string;
  subscribedDepartmentIds: Set<string>;
}

export const callIncomingRoom = (orgId: string, deptId: string): string =>
  `org:${orgId}:dept:${deptId}`;

export const callerRoom = (userId: string): string => `user:${userId}`;
