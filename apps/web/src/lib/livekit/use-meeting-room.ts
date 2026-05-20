"use client";

import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useEmitCallParticipation } from "@/lib/livekit/use-emit-call-participation";
import { trpc } from "@/lib/trpc/react";

import type { CallStatus } from "./types";

/**
 * Pre-minted LiveKit credentials for a guest joining without a session.
 * (guest-meeting-page-render): the /join/[token] flow calls the public
 * `meetings.exchangeGuestToken` procedure which returns these, and the
 * meeting page passes them in via this hook instead of going through
 * `getJoinToken` (which is a protectedProcedure and would reject a
 * sessionless request).
 */
export interface GuestRoomCredentials {
  livekitJwt: string;
  wsUrl: string;
}

interface UseMeetingRoomOptions {
  meetingId: string;
  enabled?: boolean;
  /**
   * When present, skip the `trpc.meetings.getJoinToken` mutation and
   * connect with the supplied credentials. Guests have no session so
   * the protected mutation would 401. isHost is forced false.
   */
  guestCredentials?: GuestRoomCredentials | undefined;
}

interface UseMeetingRoomResult {
  room: Room | null;
  status: CallStatus;
  errorMessage: string | null;
  isHost: boolean;
  hangup: () => void;
}

/**
 * Hook for connecting to a multi-participant LiveKit meeting room.
 *
 * Differences from useLiveKitRoom (1:1 intercom):
 *   - Fetches token via trpc.meetings.getJoinToken (not /api/livekit/token)
 *     so server-side tenant scoping + status checks (active/locked) apply.
 *   - Returns `isHost` so the UI can gate moderator controls.
 *   - adaptiveStream + dynacast tuned for ≥50 participants.
 */
export function useMeetingRoom({
  meetingId,
  enabled = true,
  guestCredentials,
}: UseMeetingRoomOptions): UseMeetingRoomResult {
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const [roomInstance, setRoomInstance] = useState<Room | null>(null);

  const utils = trpc.useUtils();

  const hangup = useCallback(() => {
    if (roomRef.current) {
      void roomRef.current.disconnect();
    }
    setStatus("ended");
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function connect() {
      try {
        // (guest-meeting-page-render): when pre-minted credentials are
        // supplied, skip the protectedProcedure. Guests have no session;
        // their JWT was minted via `meetings.exchangeGuestToken` (public).
        let wsUrl: string;
        let token: string;
        if (guestCredentials) {
          wsUrl = guestCredentials.wsUrl;
          token = guestCredentials.livekitJwt;
          // Guests are never hosts — the host flag is server-derived
          // for authed users via getJoinToken; for guests the answer is
          // always false (and we don't run getJoinToken).
          setIsHost(false);
        } else {
          const data = await utils.client.meetings.getJoinToken.mutate({
            meetingId,
          });
          if (cancelled) return;
          setIsHost(data.isHost);
          wsUrl = data.wsUrl;
          token = data.token;
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });

        roomRef.current = room;

        room.on(RoomEvent.Connected, () => {
          if (cancelled) return;
          setStatus("active");
          void room.localParticipant.enableCameraAndMicrophone();
        });

        room.on(RoomEvent.Disconnected, () => {
          if (cancelled) return;
          setStatus("ended");
        });

        room.on(RoomEvent.MediaDevicesError, () => {
          if (cancelled) return;
          setErrorMessage("Could not access camera or microphone.");
        });

        await room.connect(wsUrl, token);

        if (!cancelled) {
          setRoomInstance(room);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("failed");
        // tRPCClientError has .message; do not leak internal details otherwise.
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred.",
        );
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (roomRef.current) {
        void roomRef.current.disconnect();
        roomRef.current = null;
      }
      setRoomInstance(null);
    };
  }, [meetingId, enabled, guestCredentials, utils.client.meetings.getJoinToken]);

  // Phase 7 #14 — emit call:joined/call:left socket events on Room lifecycle.
  // Same wiring as useLiveKitRoom; both flows feed the same in-call roster.
  useEmitCallParticipation(roomInstance);

  return { room: roomInstance, status, errorMessage, isHost, hangup };
}
