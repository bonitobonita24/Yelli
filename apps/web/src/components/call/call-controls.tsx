"use client";

import { TrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";

interface CallControlsProps {
  onHangup: () => void;
}

export function CallControls({ onHangup }: CallControlsProps) {
  return (
    <div className="flex items-center justify-center gap-4 p-4">
      {/* Microphone toggle */}
      <TrackToggle
        source={Track.Source.Microphone}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Toggle microphone"
      >
        {/* Mic icon (inline SVG — lucide-react not available in this package) */}
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

      {/* Camera toggle */}
      <TrackToggle
        source={Track.Source.Camera}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Toggle camera"
      >
        {/* Video icon */}
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

      {/* Hang up button */}
      <button
        onClick={onHangup}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="End call"
        type="button"
      >
        {/* Phone off icon */}
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
          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.4a2 2 0 0 1 2-2.18h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L10.68 13.3Z" />
          <line x1="23" y1="1" x2="1" y2="23" />
        </svg>
      </button>
    </div>
  );
}
