"use client";

/**
 * Phase 7 #11 — `useUserPresence(userIds)` React hook.
 *
 * Returns a `Record<userId, boolean>` indicating which of the requested user
 * ids are currently online in the caller's org. Consumes the shared
 * `useSocketOptional()` from `@/lib/socket/socket-context` (Phase 7 #10) — does
 * NOT open its own socket. When the SocketProvider is absent or
 * NEXT_PUBLIC_SOCKET_URL is undefined, the hook degrades silently: every id
 * in the requested set maps to `false`.
 *
 * Data flow:
 *   1. On mount: socket emits `presence:snapshot` {userIds: [...]} (the org
 *      roster as the server sees it at handshake time). Pure handler
 *      replaces our local online-set with the snapshot.
 *   2. While connected: server broadcasts `presence:user` {userId, online}
 *      on every 0↔1 transition for any user in the org. Handler patches the
 *      online-set for that single id.
 *   3. On unmount: dispose unwires both listeners.
 *
 * Public contract: the returned object is keyed by THE REQUESTED IDS — not by
 * the full org roster. Callers that ask "is user X online?" get a stable
 * boolean even if X never connects (false from initial state). This keeps
 * downstream rendering hooks (e.g. memoised `<UserOnlineDot />`) stable.
 */
import { useEffect, useMemo, useState } from "react";

import { attachUserPresenceHandlers } from "@/lib/presence/user-presence-handler";
import { useSocketOptional } from "@/lib/socket/socket-context";

export function useUserPresence(userIds: string[]): Record<string, boolean> {
  const socket = useSocketOptional();
  // Server-side authoritative online-user set for this org. Starts empty;
  // `presence:snapshot` populates it at handshake. We DON'T initialise from
  // userIds because the hook input may contain users who aren't in this org.
  const [onlineSet, setOnlineSet] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (socket === null) return;

    const dispose = attachUserPresenceHandlers(socket, {
      onRoster: (ids) => {
        setOnlineSet(new Set(ids));
      },
      onUpdate: (userId, online) => {
        setOnlineSet((prev) => {
          if (online && prev.has(userId)) return prev;
          if (!online && !prev.has(userId)) return prev;
          const next = new Set(prev);
          if (online) next.add(userId);
          else next.delete(userId);
          return next;
        });
      },
    });

    return dispose;
  }, [socket]);

  return useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const id of userIds) {
      out[id] = onlineSet.has(id);
    }
    return out;
    // userIds is intentionally re-evaluated by reference — callers either
    // memo the array or accept per-render recomputation of a tiny dict.
  }, [userIds, onlineSet]);
}
