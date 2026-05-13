"use client";

import {
  Button,
  Input,
  Label,
  Textarea,
  toast,
} from "@yelli/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";


import { trpc } from "@/lib/trpc/react";

export function MeetingForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [lobbyEnabled, setLobbyEnabled] = useState(false);

  const create = trpc.meetings.create.useMutation({
    onSuccess: (meeting) => {
      toast({ title: "Meeting created", description: meeting.title });
      router.push(`/app/meeting/${meeting.id}`);
    },
    onError: (err) => {
      toast({
        title: "Failed to create meeting",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      toast({
        title: "Title required",
        description: "Please enter a meeting title.",
        variant: "destructive",
      });
      return;
    }

    create.mutate({
      title: trimmedTitle,
      description: description.trim() === "" ? undefined : description.trim(),
      scheduled_at: scheduledAt === "" ? undefined : new Date(scheduledAt),
      recording_enabled: recordingEnabled,
      lobby_enabled: lobbyEnabled,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          type="text"
          required
          maxLength={300}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          disabled={create.isPending}
          placeholder="Weekly standup"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          maxLength={2000}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          disabled={create.isPending}
          placeholder="Optional details for participants"
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="scheduled_at">Scheduled at</Label>
        <Input
          id="scheduled_at"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => {
            setScheduledAt(e.target.value);
          }}
          disabled={create.isPending}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to start an ad-hoc meeting immediately.
        </p>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2 font-normal">
          <input
            type="checkbox"
            checked={recordingEnabled}
            onChange={(e) => {
              setRecordingEnabled(e.target.checked);
            }}
            disabled={create.isPending}
            className="size-4 rounded border-input"
          />
          <span>Enable recording</span>
        </Label>
        <Label className="flex items-center gap-2 font-normal">
          <input
            type="checkbox"
            checked={lobbyEnabled}
            onChange={(e) => {
              setLobbyEnabled(e.target.checked);
            }}
            disabled={create.isPending}
            className="size-4 rounded border-input"
          />
          <span>Enable lobby (host must admit guests)</span>
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating..." : "Create meeting"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.push("/app/meetings");
          }}
          disabled={create.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
