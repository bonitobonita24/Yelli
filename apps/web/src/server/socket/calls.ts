/**
 * Phase 7 #15 — call:incoming / call:rejected handler attach.
 *
 * Unlike presence.ts and in-call.ts there is no roster — calls are
 * ephemeral per-event transmissions, not state machines. The handler
 * joins both org-scoped channels on connect and listens for client-emitted
 * call:reject events to relay org-scoped.
 *
 * Initiation flows IN from the tRPC side via emitToOrg in calls.initiate
 * (see server/socket/server.ts:getIO()). Rejection flows OUT from the
 * incoming-call-dialog via socket.emit("call:reject") → server resolves
 * caller identity from socket.data.session → emitToOrg("call:rejected").
 *
 * Server-resolved caller identity: the reject payload carries only callId.
 * The {reason} field is server-fixed to "declined" for now; "unavailable"
 * is reserved for future auto-timeout flows (not in this ticket — see
 * scope fences §5 of the design doc).
 */
import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

const CALL_INCOMING_EVENT = "call:incoming";
const CALL_REJECTED_EVENT = "call:rejected";

export function attachCallHandlers(args: {
  io: IOServer;
  socket: Socket;
}): void {
  const { io, socket } = args;
  const session = socket.data.session as SocketSession | undefined;
  if (!session) return;
  const { organizationId } = session;
  joinOrgChannel(socket, CALL_INCOMING_EVENT);
  joinOrgChannel(socket, CALL_REJECTED_EVENT);
  socket.on("call:reject", (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("callId" in payload) ||
      typeof (payload as { callId: unknown }).callId !== "string"
    ) {
      return;
    }
    const { callId } = payload as { callId: string };
    if (callId.length === 0 || callId.length > 128) return;
    emitToOrg(io, organizationId, CALL_REJECTED_EVENT, {
      callId,
      reason: "declined" as const,
    });
  });
}
