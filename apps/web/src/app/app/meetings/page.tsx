import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@yelli/ui";
import Link from "next/link";
import { redirect } from "next/navigation";


import { createServerCaller } from "@/lib/trpc/server";
import { auth } from "@/server/auth";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meetings — Yelli",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  active: "Active",
  ended: "Ended",
  cancelled: "Cancelled",
};

const STATUS_CLASSES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ended: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default async function MeetingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const caller = await createServerCaller();
  const meetings = await caller.meetings.list();

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <Button asChild>
          <Link href="/app/meetings/new">New Meeting</Link>
        </Button>
      </div>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground mb-4 text-lg">No meetings yet.</p>
          <Button asChild variant="outline">
            <Link href="/app/meetings/new">Schedule your first meeting</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => {
            const statusLabel =
              STATUS_LABELS[meeting.status] ?? meeting.status;
            const statusClass =
              STATUS_CLASSES[meeting.status] ??
              "bg-gray-100 text-gray-800";

            return (
              <Link
                key={meeting.id}
                href={`/app/meeting/${meeting.id}`}
                className="block"
              >
                <Card className="hover:border-primary/50 h-full transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 text-base">
                        {meeting.title}
                      </CardTitle>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {meeting.description ? (
                      <CardDescription className="line-clamp-2 text-sm">
                        {meeting.description}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="text-muted-foreground space-y-1 text-sm">
                    {meeting.scheduled_at ? (
                      <p>
                        <span className="font-medium">Scheduled:</span>{" "}
                        {new Date(meeting.scheduled_at).toLocaleString()}
                      </p>
                    ) : null}
                    <p>
                      <span className="font-medium">Host:</span>{" "}
                      {meeting.host.display_name === ""
                        ? meeting.host.email
                        : meeting.host.display_name}
                    </p>
                    <p>
                      <span className="font-medium">Participants:</span>{" "}
                      {meeting._count.participants}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
