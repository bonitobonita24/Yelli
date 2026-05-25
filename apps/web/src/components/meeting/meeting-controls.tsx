"use client";

import { TrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";

interface MeetingControlsProps {
  isHost: boolean;
  onLeave: () => void;
  onEndForAll: () => void;
  /** Live recording state — drives Record/Stop button label + indicator parity. */
  isRecording?: boolean | undefined;
  /** Disable both record/stop actions while a mutation is in flight. */
  isRecordingActionPending?: boolean | undefined;
  /** Host-only Egress start. Omit to hide the record button entirely. */
  onStartRecording?: (() => void) | undefined;
  /** Host-only Egress stop. Omit to hide the stop button entirely. */
  onStopRecording?: (() => void) | undefined;
}

/**
 * Bottom control bar for /app/meeting/[id]. Mic + camera + screen share for all
 * participants; "End for all" + "Record"/"Stop recording" buttons only render
 * when isHost === true. Per security.md tenant middleware safety: moderator
 * controls are display-gated AND server-enforced (host_user_id check on
 * recordings.start/stop and meetings.end mutations).
 */
export function MeetingControls({
  isHost,
  onLeave,
  onEndForAll,
  isRecording = false,
  isRecordingActionPending = false,
  onStartRecording,
  onStopRecording,
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

      {isHost && (onStartRecording || onStopRecording) ? (
        <button
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={
            isRecordingActionPending ||
            (isRecording ? !onStopRecording : !onStartRecording)
          }
          className={
            isRecording
              ? "flex h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              : "flex h-11 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          }
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          aria-pressed={isRecording}
          type="button"
        >
          <span
            className={
              isRecording
                ? "inline-block size-2 rounded-full bg-white motion-safe:animate-pulse"
                : "inline-block size-2 rounded-full bg-red-600"
            }
            aria-hidden
          />
          {isRecording ? "Stop recording" : "Record"}
        </button>
      ) : null}

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
