/**
 * Phase 8 Batch B sub-session 1 — chat realtime channel wiring.
 *
 * Server-side chat is purely emit-only from the tRPC mutation path
 * (chatRouter.send emits CHAT_MESSAGE_EVENT after persist). There are NO
 * client→server socket events for chat — the client sends a message via
 * the tRPC mutation, the mutation persists then broadcasts to the org
 * channel, and the client subscribes to receive the broadcast.
 *
 * attachChatHandlers therefore just joins the org channel for chat:message.
 * No roster, no per-message handlers, no lifecycle. The whole purpose is
 * gating subscription to the authenticated org via joinOrgChannel — the
 * security helper that sources organizationId from socket.data.session
 * (auth middleware in Phase 7 #8e-1), preventing cross-org leakage.
 *
 * Per-meeting filtering happens on the CLIENT (use-chat-messages.ts), not
 * the server, because a single user may have multiple meeting tabs open
 * and we want one socket connection to receive messages for all of them
 * — the payload carries meetingId so the client can match.
 */
import { joinOrgChannel } from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Socket } from "socket.io";

export const CHAT_MESSAGE_EVENT = "chat:message";

export function attachChatHandlers(args: { socket: Socket }): void {
  const { socket } = args;
  const session = socket.data.session as SocketSession | undefined;
  if (!session) return;
  joinOrgChannel(socket, CHAT_MESSAGE_EVENT);
}
