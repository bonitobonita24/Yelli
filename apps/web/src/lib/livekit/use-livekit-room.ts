"use client";

import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";


import type { CallStatus, LiveKitTokenResponse } from "./types";

interface UseLiveKitRoomOptions {
  callId: string;
  enabled?: boolean;
}

interface UseLiveKitRoomResult {
  room: Room | null;
  status: CallStatus;
  errorMessage: string | null;
  hangup: () => void;
}

export function useLiveKitRoom({
  callId,
  enabled = true,
}: UseLiveKitRoomOptions): UseLiveKitRoomResult {
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [roomInstance, setRoomInstance] = useState<Room | null>(null);

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
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId }),
        });

        if (!response.ok) {
          if (response.status === 503) {
            setStatus("failed");
            setErrorMessage("Video calling is not configured. Please contact your administrator.");
            return;
          }
          if (response.status === 401) {
            setStatus("failed");
            setErrorMessage("Authentication required.");
            return;
          }
          setStatus("failed");
          setErrorMessage("Failed to connect to call. Please try again.");
          return;
        }

        const data = (await response.json()) as LiveKitTokenResponse;

        if (cancelled) return;

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
        setErrorMessage(
          err instanceof Error ? err.message : "An unexpected error occurred."
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
  }, [callId, enabled]);

  return { room: roomInstance, status, errorMessage, hangup };
}
