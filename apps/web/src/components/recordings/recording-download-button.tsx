"use client";

import { Button } from "@yelli/ui";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/lib/trpc/react";

interface RecordingDownloadButtonProps {
  recordingId: string;
  disabled?: boolean;
}

/**
 * Triggers a server-minted pre-signed download URL and opens it in a new tab.
 * The URL embeds time-limited credentials (1h default) — we never persist it
 * or expose the underlying storage key to the browser.
 */
export function RecordingDownloadButton({
  recordingId,
  disabled = false,
}: RecordingDownloadButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const mutation = trpc.recordings.getDownloadUrl.useMutation({
    onSuccess: (data) => {
      // Open in a new tab so navigation away does not interrupt the download.
      window.open(data.url, "_blank", "noopener,noreferrer");
    },
    onError: (e) => {
      setError(e.message);
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || mutation.isPending}
        onClick={() => {
          setError(null);
          mutation.mutate({ id: recordingId });
        }}
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        <span className="ml-1">Download</span>
      </Button>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
