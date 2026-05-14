"use client";

interface InCallRecordingIndicatorProps {
  active: boolean;
}

/**
 * Visual badge surfaced inside the meeting header when LiveKit Egress is
 * recording the room. Driven by the meeting's `recording_enabled` flag for
 * now — wiring the live Egress status feed (Socket.IO `recording:started`/
 * `recording:stopped` events emitted by the Egress webhook) is a follow-up
 * once Part 8 sets up the webhook endpoint.
 */
export function InCallRecordingIndicator({ active }: InCallRecordingIndicatorProps) {
  if (!active) return null;

  return (
    <div
      className="flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-300"
      role="status"
      aria-live="polite"
      aria-label="Meeting is being recorded"
    >
      <span
        className="inline-block size-1.5 rounded-full bg-red-600 motion-safe:animate-pulse"
        aria-hidden
      />
      Recording
    </div>
  );
}
