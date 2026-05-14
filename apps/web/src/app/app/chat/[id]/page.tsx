import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@yelli/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerCaller } from "@/lib/trpc/server";
import { auth } from "@/server/auth";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat History — Yelli",
};

interface ChatHistoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatHistoryPage({ params }: ChatHistoryPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id: meetingId } = await params;
  const caller = await createServerCaller();

  // Fetch the meeting first so we can render the title — also acts as the
  // tenant-scoped existence check. Cross-tenant lookup throws NOT_FOUND which
  // surfaces as a 404 via Next's notFound() helper.
  let meeting: Awaited<ReturnType<typeof caller.meetings.byId>>;
  try {
    meeting = await caller.meetings.byId({ id: meetingId });
  } catch {
    notFound();
  }

  const messages = await caller.chat.listByMeeting({
    meetingId,
    limit: 500,
  });

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/app/meetings"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Back to meetings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {meeting.title}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Chat history · {messages.length}{" "}
          {messages.length === 1 ? "message" : "messages"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No chat messages were sent during this meeting.
            </p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => {
                const senderName =
                  m.sender?.display_name ||
                  m.sender?.email ||
                  m.sender_guest_name ||
                  "Guest";
                return (
                  <li key={m.id} className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{senderName}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                      {m.message_type !== "text" ? (
                        <span className="text-muted-foreground rounded-full border px-1.5 text-xs uppercase tracking-wide">
                          {m.message_type}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
