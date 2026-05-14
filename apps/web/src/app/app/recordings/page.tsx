import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@yelli/ui";
import { redirect } from "next/navigation";

import { RecordingDownloadButton } from "@/components/recordings/recording-download-button";
import { createServerCaller } from "@/lib/trpc/server";
import { auth } from "@/server/auth";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recordings — Yelli",
};

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
  deleted: "Deleted",
};

const STATUS_CLASS: Record<string, string> = {
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  deleted: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatBytes(bytesStr: string): string {
  // bytes arrives as a string (BigInt-safe transport) — parse defensively.
  const bytes = Number(bytesStr);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function RecordingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const caller = await createServerCaller();
  const recordings = await caller.recordings.list({ limit: 100 });

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Recordings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Meeting recordings available for download. Links expire after 1 hour.
        </p>
      </div>

      {recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground text-lg">No recordings yet.</p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available recordings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {recordings.map((r) => {
                const statusLabel = STATUS_LABEL[r.status] ?? r.status;
                const statusClass =
                  STATUS_CLASS[r.status] ?? "bg-gray-100 text-gray-800";
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {r.storage_type}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium">
                        {r.meeting.title}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Recorded by{" "}
                        {r.recorded_by.display_name || r.recorded_by.email} ·{" "}
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p>Duration: {formatDuration(r.duration_seconds)}</p>
                      <p className="mt-0.5">Size: {formatBytes(r.file_size_bytes)}</p>
                      <div className="mt-2">
                        <RecordingDownloadButton
                          recordingId={r.id}
                          disabled={r.status !== "ready"}
                        />
                      </div>
                    </div>
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
