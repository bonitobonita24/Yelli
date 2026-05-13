"use client";

import { TrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";

interface MeetingControlsProps {
  isHost: boolean;
  onLeave: () => void;
  onEndForAll: () => void;
}

/**
 * Bottom control bar for /app/meeting/[id]. Mic + camera + screen share for all
 * participants; "End for all" button only rendered when isHost === true.
 * Per security.md tenant middleware safety: moderator controls are display-gated
 * AND server-enforced (host_user_id check on the end mutation).
 */
export function MeetingControls({
  isHost,
  onLeave,
  onEndForAll,
}: MeetingControlsProps) {
  return (
    <div className="flex items-center justify-center gap-4 p-4">
      <TrackToggle
        source={Track.Source.Microphone}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Toggle microphone"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </TrackToggle>

      <TrackToggle
        source={Track.Source.Camera}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Toggle camera"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m22 8-6 4 6 4V8Z" />
          <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
        </svg>
      </TrackToggle>

      <TrackToggle
        source={Track.Source.ScreenShare}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Toggle screen share"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
      </TrackToggle>

      <button
        onClick={onLeave}
        className="flex h-11 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Leave meeting"
        type="button"
      >
        Leave
      </button>

      {isHost ? (
        <button
          onClick={onEndForAll}
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="End meeting for everyone"
          type="button"
        >
          End for all
        </button>
      ) : null}
    </div>
  );
}
