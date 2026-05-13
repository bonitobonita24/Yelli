import type { IncomingCallPayload } from "@/lib/livekit/types";
import type { PresenceState } from "@/lib/presence/types";

export interface ServerToClientEvents {
  "call:incoming": (payload: IncomingCallPayload) => void;
  "call:rejected": (payload: {
    callId: string;
    reason: "declined" | "unavailable";
  }) => void;
  "presence:update": (payload: {
    departmentId: string;
    state: PresenceState;
  }) => void;
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
