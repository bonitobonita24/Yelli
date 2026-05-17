"use client";

/**
 * Legacy department-level presence hook.
 *
 * Phase 7 #11 status: STUB. The server side (legacy `lib/socket/server.ts` on
 * /api/socket) registers `presence:subscribe`/`presence:heartbeat` handlers
 * but never emits `presence:update` — this hook has been silently
 * all-offline since Phase 5b. Phase 7 #11 migrated it from a wrong-origin
 * `io(NEXT_PUBLIC_APP_URL)` connection (one socket per consumer, no auth) to
 * the shared `useSocketOptional()` socket from the Phase 7 #10 SocketProvider
 * (one shared connection, auth-gated, correct origin).
 *
 * Public contract preserved exactly: pass `departmentIds[]`, get
 * `Record<departmentId, PresenceState>`. Currently every department resolves
 * to `"offline"` — matches the existing UX (speed-dial buttons disabled).
 *
 * The real wiring comes in the Department-Binding follow-up ticket
 * (PRODUCT.md:27 — Speed Dial Board "real-time online/offline presence
 * indicator"). That ticket adds a userId↔departmentId binding (a
 * `device_binding_token` or `default_user_id` column on Department) and
 * consumes `useUserPresence(boundUserIds)` to derive per-department state.
 *
 * Until then, this hook stays in place so `<SpeedDialGrid>` keeps compiling
 * without changes and downstream consumers see a stable, documented null
 * presence rather than a runtime crash or a leaking socket.
 */
import { useEffect } from "react";

import { useSocketOptional } from "@/lib/socket/socket-context";

import type { PresenceState } from "./types";

export function usePresence(
  departmentIds: string[],
): Record<string, PresenceState> {
  const socket = useSocketOptional();

  // Touch the shared socket so this hook participates in connection lifecycle
  // bookkeeping (no-op listener; replaced by real handlers when department-
  // binding ships). Keeping the dependency makes future migration a one-line
  // change rather than rewiring imports across consumers.
  useEffect(() => {
    if (socket === null) return;
    // Reserved: subscribe to presence:user / presence:snapshot here once the
    // userId↔departmentId binding is available. See lib/presence/
    // use-user-presence.ts for the active engine.
  }, [socket]);

  const out: Record<string, PresenceState> = {};
  for (const id of departmentIds) {
    out[id] = "offline";
  }
  return out;
}
