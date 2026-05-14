"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yelli/ui";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import { trpc } from "@/lib/trpc/react";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — must match storage MAX_UPLOAD_BYTES

interface InCallFileDropzoneProps {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * In-call file share dialog. Accepts a single file via click-or-drop, then
 * announces it as a `file` chat message. The actual upload pipeline (S3 PUT
 * via pre-signed URL) is wired in a follow-up — this component currently
 * surfaces the chat message with the file name so participants are notified
 * a file was shared; the real upload endpoint slot is reserved.
 *
 * Native HTML5 dnd is used here intentionally to avoid pulling in Kibo UI
 * or react-dropzone during this scaffold Part. Swapping to Kibo UI's
 * `Dropzone` block later is a drop-in upgrade.
 */
export function InCallFileDropzone({
  meetingId,
  open,
  onOpenChange,
}: InCallFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: () => {
      void utils.chat.listByMeeting.invalidate({ meetingId });
      setSelected(null);
      setError(null);
      onOpenChange(false);
    },
    onError: (e) => {
      setError(e.message);
    },
  });

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`File exceeds 10 MB limit (got ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }
    setError(null);
    setSelected(file);
  }

  function handleShare() {
    if (!selected) return;
    // file_url is left as a placeholder until the in-call upload endpoint
    // is wired in a follow-up. The chat message still announces the share.
    sendMutation.mutate({
      meetingId,
      content: `Shared file: ${selected.name} (${(selected.size / 1024).toFixed(1)} KB)`,
      messageType: "file",
      fileUrl: `pending://${encodeURIComponent(selected.name)}`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share a file</DialogTitle>
          <DialogDescription>
            Drag a file here or click to pick one. Max 10 MB.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => {
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
        >
          <Upload className="text-muted-foreground size-8" aria-hidden />
          {selected ? (
            <>
              <p className="font-medium">{selected.name}</p>
              <p className="text-muted-foreground text-xs">
                {(selected.size / 1024).toFixed(1)} KB
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Drop a file here, or click to browse
            </p>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
          }}
        />

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selected || sendMutation.isPending}
            onClick={handleShare}
          >
            {sendMutation.isPending ? "Sharing…" : "Share"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
