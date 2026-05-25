import { describe, expect, it, vi } from "vitest";

import {
  attachChatMessageHandler,
  type ChatMessageEventPayload,
  type MinimalChatSocketEventTarget,
} from "@/lib/chat/chat-message-handler";

type EventHandler = (payload: ChatMessageEventPayload) => void;

function makeFakeSocket(): {
  socket: MinimalChatSocketEventTarget;
  handlers: Map<"chat:message", Set<EventHandler>>;
} {
  const handlers = new Map<"chat:message", Set<EventHandler>>();
  const socket: MinimalChatSocketEventTarget = {
    on(event, handler) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as EventHandler);
      handlers.set(event, set);
      return socket;
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler as EventHandler);
      return socket;
    },
  };
  return { socket, handlers };
}

const SAMPLE_PAYLOAD: ChatMessageEventPayload = {
  meetingId: "meeting-cuid-123",
  message: {
    id: "msg-cuid-456",
    content: "hello",
    message_type: "text",
    file_url: null,
    sender_guest_name: null,
    created_at: "2026-05-25T22:00:00.000Z",
    sender: {
      id: "user-cuid-789",
      display_name: "Sender",
      email: "sender@example.com",
    },
  },
};

describe("attachChatMessageHandler", () => {
  it("invokes callback on chat:message event", () => {
    const { socket, handlers } = makeFakeSocket();
    const callback = vi.fn();

    attachChatMessageHandler(socket, callback);

    const subscribed = handlers.get("chat:message");
    expect(subscribed?.size).toBe(1);

    // Simulate server emit
    subscribed!.forEach((h) => {
      h(SAMPLE_PAYLOAD);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(SAMPLE_PAYLOAD);
  });

  it("dispose removes the listener (no more callbacks after dispose)", () => {
    const { socket, handlers } = makeFakeSocket();
    const callback = vi.fn();

    const dispose = attachChatMessageHandler(socket, callback);

    expect(handlers.get("chat:message")?.size).toBe(1);

    dispose();

    expect(handlers.get("chat:message")?.size).toBe(0);

    // Future emits do not invoke the disposed callback
    handlers.get("chat:message")?.forEach((h) => {
      h(SAMPLE_PAYLOAD);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("multiple subscriptions are independent — dispose only unwires the matching pair", () => {
    const { socket, handlers } = makeFakeSocket();
    const callbackA = vi.fn();
    const callbackB = vi.fn();

    const disposeA = attachChatMessageHandler(socket, callbackA);
    attachChatMessageHandler(socket, callbackB);

    expect(handlers.get("chat:message")?.size).toBe(2);

    disposeA();

    expect(handlers.get("chat:message")?.size).toBe(1);

    handlers.get("chat:message")?.forEach((h) => {
      h(SAMPLE_PAYLOAD);
    });
    expect(callbackA).not.toHaveBeenCalled();
    expect(callbackB).toHaveBeenCalledTimes(1);
  });
});
