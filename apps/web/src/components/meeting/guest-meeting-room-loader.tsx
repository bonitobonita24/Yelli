"use client";

/**
 * (guest-meeting-page-render) — guest-only meeting page entry point.
 *
 * Renders on `/app/meeting/{id}?guest=1` after the middleware bypass
 * (see `@/server/guest-bypass`) lets a sessionless request through.
 *
 * Flow:
 *   1. Read `sessionStorage["yelli:guest-meeting:{meetingId}"]`
 *   2. Validate shape via `parseGuestMeetingCredentials` (pure helper)
 *   3. If valid → render <MeetingRoom guestCredentials={...} />
 *   4. If missing/malformed → show "Session expired" UI and link back
 *      to the join page. We don't auto-redirect (we don't know the
 *      original /join/{token} URL — the token isn't in the payload).
 *
 * Why a Client Component:
 *   - sessionStorage is browser-only — the meeting page reads it on
 *     mount, after Next.js has handed off to the client.
 *   - The MeetingRoom subtree is already client-only via the
 *     existing meeting-room-loader.tsx dynamic wrapper.
 */

import { useEffect, useState } from "react";

import { MeetingRoom } from "@/components/meeting/meeting-room-loader";
import {
  guestCredentialsStorageKey,
  parseGuestMeetingCredentials,
  type GuestMeetingCredentials,
} from "@/server/guest-credentials";

interface GuestMeetingRoomLoaderProps {
  meetingId: string;
}

type LoadState =
  | { kind: "reading" }
  | { kind: "missing" }
  | { kind: "ready"; credentials: GuestMeetingCredentials };

export function GuestMeetingRoomLoader({
  meetingId,
}: GuestMeetingRoomLoaderProps) {
  const [state, setState] = useState<LoadState>({ kind: "reading" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(
      guestCredentialsStorageKey(meetingId),
    );
    const credentials = parseGuestMeetingCredentials(raw);
    setState(
      credentials ? { kind: "ready", credentials } : { kind: "missing" },
    );
  }, [meetingId]);

  if (state.kind === "reading") {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Loading guest session…
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Guest session expired</h1>
        <p className="max-w-md text-muted-foreground">
          Your guest meeting credentials are not available. This can happen
          if the tab was closed, the session expired, or you opened the link
          in a new tab without re-entering the join page.
        </p>
        <p className="max-w-md text-muted-foreground">
          Please return to the original meeting invite link to rejoin.
        </p>
      </div>
    );
  }

  // state.kind === "ready"
  // Title is intentionally a placeholder for guests — guests don't see the
  // server-side meeting title (we don't expose it through the public
  // exchangeGuestToken response). The room itself is identified by the JWT.
  return (
    <MeetingRoom
      meetingId={meetingId}
      title="Meeting"
      recordingEnabled={false}
      guestCredentials={{
        livekitJwt: state.credentials.livekitJwt,
        wsUrl: state.credentials.wsUrl,
      }}
    />
  );
}
