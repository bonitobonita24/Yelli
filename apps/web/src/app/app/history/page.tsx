import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@yelli/ui";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerCaller } from "@/lib/trpc/server";
import { auth } from "@/server/auth";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Call History — Yelli",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  missed: "Missed",
  failed: "Failed",
};

const STATUS_CLASS: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  missed: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const TYPE_LABEL: Record<string, string> = {
  intercom: "1:1 Call",
  meeting: "Meeting",
};

function formatDuration(startedAt: Date, endedAt: Date | null): string {
  if (!endedAt) return "—";
  const seconds = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default async function CallHistoryPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const caller = await createServerCaller();
  const logs = await caller.calls.listHistory({ limit: 100 });

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Call History</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Recent intercom calls and meetings across your organization.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground text-lg">No calls yet.</p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most recent</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {logs.map((log) => {
                const statusLabel = STATUS_LABEL[log.status] ?? log.status;
                const statusClass =
                  STATUS_CLASS[log.status] ?? "bg-gray-100 text-gray-800";
                const typeLabel = TYPE_LABEL[log.call_type] ?? log.call_type;
                const counterpart =
                  log.call_type === "meeting"
                    ? log.meeting?.title ?? "Untitled meeting"
                    : log.recipient_department?.name ?? "Unknown department";
                const detailHref =
                  log.call_type === "meeting" && log.meeting_id
                    ? `/app/chat/${log.meeting_id}`
                    : null;

                const row = (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {typeLabel}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium">
                        {counterpart}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Caller:{" "}
                        {log.caller
                          ? log.caller.display_name || log.caller.email
                          : "—"}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p>{new Date(log.started_at).toLocaleString()}</p>
                      <p className="mt-0.5">
                        Duration:{" "}
                        {formatDuration(
                          new Date(log.started_at),
                          log.ended_at ? new Date(log.ended_at) : null,
                        )}
                      </p>
                      <p className="mt-0.5">
                        Participants: {log.participant_count}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <li key={log.id}>
                    {detailHref ? (
                      <Link
                        href={detailHref}
                        className="hover:bg-accent/40 block transition-colors"
                      >
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
