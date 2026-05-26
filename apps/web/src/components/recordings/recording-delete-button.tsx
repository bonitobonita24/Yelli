"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@yelli/ui";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { trpc } from "@/lib/trpc/react";

// Pure constants and helpers live in a plain .ts file so they can be
// imported by vitest tests running in environment: "node" without JSX
// parse errors. Imported here for use in JSX + re-exported for consumers.
import { buildDeletePayload, recordingDeleteCopy } from "./recording-delete-copy";
export { buildDeletePayload, recordingDeleteCopy };

interface RecordingDeleteButtonProps {
  recordingId: string;
  disabled?: boolean;
}

/**
 * Soft-delete a recording. Opens a shadcn AlertDialog confirmation,
 * fires recordings.softDelete on confirm, then invalidates the
 * recordings.list query and refreshes the route to drop the row.
 * Errors render inline under the trigger button (dialog stays open
 * for retry). Mirrors the in-flight pattern from
 * RecordingDownloadButton (Loader2 icon swap).
 */
export function RecordingDeleteButton({
  recordingId,
  disabled = false,
}: RecordingDeleteButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const router = useRouter();

  const mutation = trpc.recordings.softDelete.useMutation({
    onSuccess: () => {
      setOpen(false);
      void utils.recordings.list.invalidate();
      router.refresh();
    },
    onError: (e: { message: string }) => {
      setError(e.message);
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || mutation.isPending}
            aria-label={recordingDeleteCopy.triggerLabel}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{recordingDeleteCopy.dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {recordingDeleteCopy.dialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setError(null);
              }}
            >
              {recordingDeleteCopy.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setError(null);
                mutation.mutate(buildDeletePayload(recordingId));
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                recordingDeleteCopy.confirmLabel
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
