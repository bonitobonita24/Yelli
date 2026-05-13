"use client";

import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { trpc } from "@/lib/trpc/react";

import type { CallStatus } from "./types";

interface UseMeetingRoomOptions {
  meetingId: string;
  enabled?: boolean;
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
        const data = await utils.client.meetings.getJoinToken.mutate({
          meetingId,
        });

        if (cancelled) return;
        setIsHost(data.isHost);

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

        await room.connect(data.wsUrl, data.token);

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
  }, [meetingId, enabled, utils.client.meetings.getJoinToken]);

  return { room: roomInstance, status, errorMessage, isHost, hangup };
}
