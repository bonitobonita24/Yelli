"use client";

/**
 * Phase 8 Batch B sub-session 1 — `useChatMessages(meetingId, onMessage)`
 * React hook.
 *
 * Subscribes to the org-scoped `chat:message` socket event and invokes
 * `onMessage` only when the payload's `meetingId` matches the current
 * one. Consumes the shared `useSocketOptional()` from
 * `@/lib/socket/socket-context` (Phase 7 #10) — does NOT open its own
 * socket. When the SocketProvider is absent or NEXT_PUBLIC_SOCKET_URL is
 * undefined, the hook degrades silently (no subscription, no error).
 *
 * `onMessage` is captured via a ref so the hook does NOT re-subscribe on
 * every parent render — callers can pass an inline closure without
 * triggering unsubscribe/resubscribe churn on each cache invalidation.
 *
 * Replaces the 3-second `refetchInterval` polling that lived in
 * `in-call-chat.tsx` before this sub-session.
 */
import { useEffect, useRef } from "react";

import {
  attachChatMessageHandler,
  type ChatMessageEventPayload,
} from "@/lib/chat/chat-message-handler";
import { useSocketOptional } from "@/lib/socket/socket-context";

export function useChatMessages(
  meetingId: string,
  onMessage: (payload: ChatMessageEventPayload) => void,
): void {
  const socket = useSocketOptional();
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (socket === null) return;

    return attachChatMessageHandler(socket, (payload) => {
      if (payload.meetingId === meetingId) {
        onMessageRef.current(payload);
      }
    });
  }, [socket, meetingId]);
}
