"use client";

/**
 * Phase 7 #14 — emit `call:joined`/`call:left` socket events when a LiveKit
 * Room transitions between Connected and Disconnected.
 *
 * Composable hook invoked from `useLiveKitRoom` (intercom calls) and
 * `useMeetingRoom` (scheduled meetings) — both flows result in the same
 * server-side in-call state. The hook takes a Room instance (or null while
 * the LiveKit token request is in flight).
 *
 * Lifecycle:
 *   • room === null            → no-op (no listeners attached)
 *   • room becomes non-null    → register Connected/Disconnected handlers
 *   • room becomes null again  → previous useEffect cleanup unwires handlers
 *
 * The socket comes from `useSocketOptional()` (Phase 7 #10). When the
 * socket is null (SocketProvider absent or NEXT_PUBLIC_SOCKET_URL unset),
 * the hook is a silent no-op — same degradation pattern as useUserPresence.
 *
 * SECURITY: the server sources userId from socket.data.session — the client
 * cannot lie about identity. Worst-case misuse: a malicious client emits
 * call:joined without actually joining a LiveKit room, which marks itself
 * in_call → blocks others from calling them → only hurts the attacker.
 */
import { RoomEvent, type Room } from "livekit-client";
import { useEffect } from "react";

import { useSocketOptional } from "@/lib/socket/socket-context";

export function useEmitCallParticipation(room: Room | null): void {
  const socket = useSocketOptional();

  useEffect(() => {
    if (socket === null || room === null) return;

    const onConnected = (): void => {
      socket.emit("call:joined");
    };
    const onDisconnected = (): void => {
      socket.emit("call:left");
    };

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [socket, room]);
}
