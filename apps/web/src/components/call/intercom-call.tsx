"use client";

import {
  RoomContext,
  GridLayout,
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CallControls } from "@/components/call/call-controls";
import { useLiveKitRoom } from "@/lib/livekit/use-livekit-room";

interface IntercomCallProps {
  callId: string;
  displayName: string;
}

function CallInner({ onHangup }: { onHangup: () => void }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <GridLayout
          tracks={tracks}
          style={{ height: "100%", width: "100%" }}
        >
          <ParticipantTile />
        </GridLayout>
      </div>
      <div className="border-t border-border bg-background">
        <CallControls onHangup={onHangup} />
      </div>
    </div>
  );
}

export function IntercomCall({ callId, displayName: _displayName }: IntercomCallProps) {
  const router = useRouter();
  const { room, status, errorMessage, hangup } = useLiveKitRoom({ callId });

  useEffect(() => {
    if (status === "ended") {
      router.replace("/app");
    }
  }, [status, router]);

  if (status === "connecting") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-current border-t-transparent"
            aria-label="Connecting…"
            role="status"
          />
          <p className="text-sm">Connecting to call…</p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          {/* Alert circle icon */}
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
          <p className="font-semibold text-destructive">Call failed</p>
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/app")}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Return to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Call ended. Redirecting…</p>
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
      <CallInner onHangup={hangup} />
    </RoomContext.Provider>
  );
}
