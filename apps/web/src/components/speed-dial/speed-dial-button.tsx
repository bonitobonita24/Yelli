"use client";

import { cn } from "@yelli/ui";

import type { PresenceState } from "@/lib/presence/types";

interface SpeedDialButtonProps {
  id: string;
  name: string;
  description?: string | null;
  presenceState: PresenceState;
  autoAnswer: boolean;
  onCall: (id: string) => void;
}

const presenceDotClass: Record<PresenceState, string> = {
  online: "bg-green-500",
  offline: "bg-muted-foreground/40",
  in_call: "bg-yellow-400",
};

const presenceLabel: Record<PresenceState, string> = {
  online: "online",
  offline: "offline",
  in_call: "in call",
};

export function SpeedDialButton({
  id,
  name,
  description,
  presenceState,
  autoAnswer,
  onCall,
}: SpeedDialButtonProps) {
  const isDisabled =
    presenceState === "offline" || presenceState === "in_call";

  return (
    <button
      type="button"
      aria-label={`Call ${name} (${presenceLabel[presenceState]})`}
      disabled={isDisabled}
      onClick={() => {
        onCall(id);
      }}
      className={cn(
        "relative flex min-h-[100px] w-full flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDisabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {/* Presence indicator dot */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute right-3 top-3 h-2.5 w-2.5 rounded-full",
          presenceDotClass[presenceState],
        )}
      />

      {/* Auto-answer badge */}
      {autoAnswer && (
        <span
          aria-label="Auto-answer enabled"
          className="absolute left-3 top-3 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
        >
          ⚡ Auto
        </span>
      )}

      <span className="text-sm font-medium leading-tight">{name}</span>

      {description != null && description !== "" && (
        <span className="line-clamp-2 text-center text-xs text-muted-foreground">
          {description}
        </span>
      )}
    </button>
  );
}
