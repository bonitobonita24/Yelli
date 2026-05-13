"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { clientEnv } from "@/env";

import type { PresenceState, PresenceUpdate } from "./types";

export function usePresence(
  departmentIds: string[],
): Record<string, PresenceState> {
  const [presence, setPresence] = useState<Record<string, PresenceState>>(
    () =>
      Object.fromEntries(
        departmentIds.map((id) => [id, "offline" as PresenceState]),
      ),
  );

  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a stable ref to departmentIds for use inside effect callbacks
  const departmentIdsRef = useRef<string[]>(departmentIds);
  departmentIdsRef.current = departmentIds;

  useEffect(() => {
    // Add any new ids as "offline" without clobbering existing states
    setPresence((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of departmentIds) {
        if (!(id in next)) {
          next[id] = "offline";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [departmentIds]);

  useEffect(() => {
    if (departmentIds.length === 0) return;

    let socket: Socket;

    try {
      socket = io(clientEnv.NEXT_PUBLIC_APP_URL, {
        path: "/api/socket",
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 2_000,
      });
      socketRef.current = socket;
    } catch {
      // Presence server unavailable — degrade silently, all remain "offline"
      return;
    }

    function handleConnect() {
      socket.emit("presence:subscribe", departmentIdsRef.current);
    }

    function handlePresenceUpdate(update: PresenceUpdate) {
      setPresence((prev) => {
        if (prev[update.departmentId] === update.state) return prev;
        return { ...prev, [update.departmentId]: update.state };
      });
    }

    function handleDisconnect() {
      // Mark all tracked departments as offline on disconnect
      setPresence((prev) => {
        const next: Record<string, PresenceState> = {};
        for (const key of Object.keys(prev)) {
          next[key] = "offline";
        }
        return next;
      });
    }

    socket.on("connect", handleConnect);
    socket.on("presence:update", handlePresenceUpdate);
    socket.on("disconnect", handleDisconnect);

    // 30-second heartbeat per security rules §Realtime Connection Safety
    heartbeatRef.current = setInterval(() => {
      if (socket.connected) {
        socket.emit("presence:heartbeat");
      }
    }, 30_000);

    return () => {
      if (heartbeatRef.current !== null) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      socket.off("connect", handleConnect);
      socket.off("presence:update", handlePresenceUpdate);
      socket.off("disconnect", handleDisconnect);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount/unmount only — ids handled via ref

  return presence;
}
