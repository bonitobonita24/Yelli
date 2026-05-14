"use client";

import { Button, Input } from "@yelli/ui";
import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { trpc } from "@/lib/trpc/react";

interface InCallChatProps {
  meetingId: string;
  open: boolean;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 3000;
const MAX_MESSAGE_LEN = 4000;

/**
 * Slide-in chat sidebar overlay anchored to the right edge of the meeting
 * room. Polls the chat router every 3s — Socket.IO push-based delivery is
 * a follow-up once the Egress/chat event bus is wired in Part 8.
 *
 * Renders as a fixed positioned aside (mobile: full-width sheet via
 * inset-x-0 / sm:inset-x-auto sm:right-0 sm:max-w-sm).
 */
export function InCallChat({ meetingId, open, onClose }: InCallChatProps) {
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();
  const scrollRef = useRef<HTMLDivElement>(null);

  const messagesQuery = trpc.chat.listByMeeting.useQuery(
    { meetingId, limit: 200 },
    {
      enabled: open,
      refetchInterval: open ? POLL_INTERVAL_MS : false,
    },
  );

  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: () => {
      setDraft("");
      void utils.chat.listByMeeting.invalidate({ meetingId });
    },
  });

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, messagesQuery.data?.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0 || sendMutation.isPending) return;
    sendMutation.mutate({ meetingId, content: trimmed, messageType: "text" });
  }

  if (!open) return null;

  const messages = messagesQuery.data ?? [];

  return (
    <aside
      className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col border-l border-border bg-background shadow-xl sm:inset-x-auto sm:right-0 sm:top-0 sm:h-full sm:w-80"
      aria-label="Meeting chat"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Chat</h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Close chat"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2"
      >
        {messagesQuery.isLoading ? (
          <p className="text-muted-foreground py-8 text-center text-xs">
            Loading messages…
          </p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-xs">
            No messages yet. Say hello.
          </p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li key={m.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">
                    {m.sender?.display_name ||
                      m.sender?.email ||
                      m.sender_guest_name ||
                      "Guest"}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {m.message_type === "file" && m.file_url ? (
                  <a
                    href={m.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {m.content}
                  </a>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border px-3 py-2"
      >
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, MAX_MESSAGE_LEN));
            }}
            placeholder="Message…"
            disabled={sendMutation.isPending}
            aria-label="Message"
          />
          <Button
            type="submit"
            size="sm"
            disabled={draft.trim().length === 0 || sendMutation.isPending}
            aria-label="Send"
          >
            <Send className="size-4" aria-hidden />
          </Button>
        </div>
        {sendMutation.error ? (
          <p className="text-destructive mt-1 text-xs" role="alert">
            {sendMutation.error.message}
          </p>
        ) : null}
      </form>
    </aside>
  );
}
