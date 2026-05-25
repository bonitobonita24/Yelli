"use client";

import {
  GridLayout,
  ParticipantTile,
  RoomContext,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
// @livekit/components-styles loaded via globals.css (relative file path) —
// see globals.css for the rationale. Importing here as a JS side-effect
// pulls the package into the SSR chunk graph and breaks page-data collection.
import { Button, toast } from "@yelli/ui";
import { Track } from "livekit-client";
import { MessageSquare, PaintBucket, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";


import { endOfCallPolicy } from "@/components/meeting/end-of-call-policy";
import { InCallChat } from "@/components/meeting/in-call-chat";
import { InCallFileDropzone } from "@/components/meeting/in-call-file-dropzone";
import { InCallRecordingIndicator } from "@/components/meeting/in-call-recording-indicator";
import { InCallWhiteboard } from "@/components/meeting/in-call-whiteboard";
import { MeetingControls } from "@/components/meeting/meeting-controls";
import { useMeetingRoom } from "@/lib/livekit/use-meeting-room";
import { trpc } from "@/lib/trpc/react";

interface MeetingRoomProps {
  meetingId: string;
  title: string;
  recordingEnabled?: boolean;
  /**
   * (guest-meeting-page-render): when present, the room connects with
   * pre-minted credentials from `meetings.exchangeGuestToken` instead
   * of calling the protected `getJoinToken` mutation. Used by the
   * guest meeting loader for sessionless joins.
   */
  guestCredentials?:
    | {
        livekitJwt: string;
        wsUrl: string;
      }
    | undefined;
}

function MeetingInner({
  meetingId,
  title,
  isHost,
  startedAt,
  recordingEnabled,
  onLeave,
  onEnded,
}: {
  meetingId: string;
  title: string;
  isHost: boolean;
  startedAt: number;
  recordingEnabled: boolean;
  onLeave: () => void;
  onEnded: () => void;
}) {
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [dropzoneOpen, setDropzoneOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  // Locally-tracked recording state so the UI flips immediately on start/stop
  // mutations without waiting for a meeting refetch. Initialised from the
  // server-side recording_enabled prop; webhook completion still flows in
  // via the next meeting fetch / Socket.IO push.
  const [recordingLive, setRecordingLive] = useState(recordingEnabled);

  const endMutation = trpc.meetings.end.useMutation({
    onSuccess: () => {
      toast({ title: "Meeting ended" });
      onEnded();
    },
    onError: (err) => {
      toast({
        title: "Failed to end meeting",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const startRecordingMutation = trpc.recordings.start.useMutation({
    onSuccess: () => {
      setRecordingLive(true);
      toast({ title: "Recording started" });
    },
    onError: (err) => {
      toast({
        title: "Failed to start recording",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const stopRecordingMutation = trpc.recordings.stop.useMutation({
    onSuccess: () => {
      setRecordingLive(false);
      toast({ title: "Recording stopped" });
    },
    onError: (err) => {
      toast({
        title: "Failed to stop recording",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleEndForAll() {
    endMutation.mutate({
      meetingId,
      participantCount: participants.length,
      status: "completed",
    });
  }

  function handleStartRecording() {
    startRecordingMutation.mutate({ meetingId });
  }

  function handleStopRecording() {
    stopRecordingMutation.mutate({ meetingId });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-semibold leading-tight">{title}</h1>
            <p className="text-xs text-muted-foreground">
              {participants.length} participant
              {participants.length === 1 ? "" : "s"}
              {" · "}
              {formatDuration(Date.now() - startedAt)}
            </p>
          </div>
          <InCallRecordingIndicator active={recordingLive} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setChatOpen((v) => !v);
            }}
            aria-label="Toggle chat"
            aria-pressed={chatOpen}
          >
            <MessageSquare className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDropzoneOpen(true);
            }}
            aria-label="Share file"
          >
            <Paperclip className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setWhiteboardOpen(true);
            }}
            aria-label="Open whiteboard"
          >
            <PaintBucket className="size-4" aria-hidden />
          </Button>
          {isHost ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Host
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-hidden bg-black">
        <GridLayout
          tracks={tracks}
          style={{ height: "100%", width: "100%" }}
        >
          <ParticipantTile />
        </GridLayout>
      </div>

      <div className="border-t border-border bg-background">
        <MeetingControls
          isHost={isHost}
          onLeave={onLeave}
          onEndForAll={handleEndForAll}
          isRecording={recordingLive}
          isRecordingActionPending={
            startRecordingMutation.isPending || stopRecordingMutation.isPending
          }
          onStartRecording={isHost ? handleStartRecording : undefined}
          onStopRecording={isHost ? handleStopRecording : undefined}
        />
      </div>

      <InCallChat
        meetingId={meetingId}
        open={chatOpen}
        onClose={() => {
          setChatOpen(false);
        }}
      />
      <InCallFileDropzone
        meetingId={meetingId}
        open={dropzoneOpen}
        onOpenChange={setDropzoneOpen}
      />
      <InCallWhiteboard
        open={whiteboardOpen}
        onOpenChange={setWhiteboardOpen}
      />
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function MeetingRoom({
  meetingId,
  title,
  recordingEnabled = false,
  guestCredentials,
}: MeetingRoomProps) {
  const router = useRouter();
  const { room, status, errorMessage, isHost, hangup } = useMeetingRoom({
    meetingId,
    guestCredentials,
  });
  const startedAtRef = useRef<number>(Date.now());
  const [, forceTick] = useState(0);

  // (meeting-room-guest-disconnect-redirect): host vs guest end-of-call
  // routing/copy is decided by the pure `endOfCallPolicy` helper so it
  // can be unit-tested in the node vitest environment.
  const policy = endOfCallPolicy({ isGuest: guestCredentials !== undefined });

  // Re-render every second so the header duration ticks while connected.
  useEffect(() => {
    if (status !== "active") return;
    const interval = setInterval(() => {
      forceTick((t) => t + 1);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "ended") return;
    const target = policy.redirectAfterEnded;
    if (target !== null) {
      router.replace(target);
    }
  }, [status, router, policy.redirectAfterEnded]);

  if (status === "connecting") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-current border-t-transparent"
            aria-label="Connecting…"
            role="status"
          />
          <p className="text-sm">Joining meeting…</p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-destructive"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <p className="font-semibold text-destructive">Could not join</p>
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => {
              router.replace(policy.failedCtaHref);
            }}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {policy.failedCtaLabel}
          </button>
        </div>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{policy.endedMessage}</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent"
          aria-label="Loading…"
          role="status"
        />
      </div>
    );
  }

  return (
    <RoomContext.Provider value={room}>
      <MeetingInner
        meetingId={meetingId}
        title={title}
        isHost={isHost}
        startedAt={startedAtRef.current}
        recordingEnabled={recordingEnabled}
        onLeave={hangup}
        onEnded={hangup}
      />
    </RoomContext.Provider>
  );
}
