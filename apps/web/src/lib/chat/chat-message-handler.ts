/**
 * Phase 8 Batch B sub-session 1 — pure handler for the chat realtime engine.
 *
 * The auth-gated Socket.IO server emits ONE event for chat:
 *
 *   - `chat:message` {meetingId, message} — broadcast to the org channel
 *     after `chatRouter.send` persists a new message. There is no snapshot
 *     event because the initial render uses the existing tRPC query
 *     (`chat.listByMeeting`). Realtime only patches the cache going forward.
 *
 * The org channel broadcasts every chat message in the org to every
 * connected client; per-meeting filtering happens on the client (the same
 * user may have multiple meeting tabs open). The payload's `meetingId`
 * field is the filter key.
 *
 * Pure module — no React, no Next.js — node-testable per the
 * [[pure-helper-extraction-pattern]] (Phase 7 #7c-2 / #8e / #10).
 *
 * The `MinimalChatSocketEventTarget` shape narrows the surface to just
 * `on`/`off` with one event name. The real TypedSocket from
 * `@/lib/socket/client` satisfies this contract without an explicit cast;
 * tests stub it with a hand-rolled fake.
 */

export interface ChatMessageSender {
  id: string;
  display_name: string | null;
  email: string;
}

export interface ChatMessagePayload {
  id: string;
  content: string;
  message_type: "text" | "file";
  file_url: string | null;
  sender_guest_name: string | null;
  created_at: string | Date;
  sender: ChatMessageSender | null;
}

export interface ChatMessageEventPayload {
  meetingId: string;
  message: ChatMessagePayload;
}

export interface MinimalChatSocketEventTarget {
  on(
    event: "chat:message",
    handler: (payload: ChatMessageEventPayload) => void,
  ): unknown;
  off(
    event: "chat:message",
    handler: (payload: ChatMessageEventPayload) => void,
  ): unknown;
}

export type ChatMessageCallback = (payload: ChatMessageEventPayload) => void;

export type ChatMessageDisposer = () => void;

export function attachChatMessageHandler(
  socket: MinimalChatSocketEventTarget,
  callback: ChatMessageCallback,
): ChatMessageDisposer {
  const onMessage = (payload: ChatMessageEventPayload): void => {
    callback(payload);
  };

  socket.on("chat:message", onMessage);

  return () => {
    socket.off("chat:message", onMessage);
  };
}
