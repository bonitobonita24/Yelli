"use client";

/**
 * Phase 7 #14 — `useUsersInCall(userIds)` React hook.
 *
 * Returns a `ReadonlySet<userId>` containing the org's currently-in-call
 * users (i.e. their browser has emitted `call:joined` and not yet emitted
 * `call:left` or disconnected). Consumes the shared `useSocketOptional()`
 * from `@/lib/socket/socket-context` (Phase 7 #10) — does NOT open its own
 * socket. When the SocketProvider is absent or NEXT_PUBLIC_SOCKET_URL is
 * undefined, the hook degrades silently: returns a frozen empty Set.
 *
 * Data flow:
 *   1. On mount: socket emits `call:active-snapshot` {userIds: [...]} (the
 *      org roster as the server sees it at handshake time). Pure handler
 *      replaces our local in-call-set with the snapshot.
 *   2. While connected: server broadcasts `call:active` {userId, in_call}
 *      on every 0↔1 transition for any user in the org. Handler patches
 *      the in-call-set for that single id.
 *   3. On unmount: dispose unwires both listeners.
 *
 * Public contract: the returned Set is the FULL in-call user set for the
 * org (not filtered to the `userIds` argument). Callers compose it via
 * `selectDepartmentPresence(dept, online, inCall)` — the helper does the
 * `.has()` check. This matches the precedent set by Phase 7 #11 where the
 * online-set is also unfiltered. The `userIds` argument is kept on the
 * signature for API symmetry with `useUserPresence(userIds)` and so that a
 * future filtering optimisation can be added without breaking callers.
 *
 * Mirrors `use-user-presence.ts` byte-for-byte in structure; the only
 * differences are the handler import + the return type (Set vs Record).
 */
import { useEffect, useState } from "react";

import { attachInCallHandlers } from "@/lib/presence/in-call-handler";
import { useSocketOptional } from "@/lib/socket/socket-context";

const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

export function useUsersInCall(_userIds: string[]): ReadonlySet<string> {
  const socket = useSocketOptional();
  void _userIds; // see contract note above

  const [inCallSet, setInCallSet] = useState<ReadonlySet<string>>(EMPTY_SET);

  useEffect(() => {
    if (socket === null) return;

    const dispose = attachInCallHandlers(socket, {
      onRoster: (ids) => {
        setInCallSet(new Set(ids));
      },
      onUpdate: (userId, in_call) => {
        setInCallSet((prev) => {
          if (in_call && prev.has(userId)) return prev;
          if (!in_call && !prev.has(userId)) return prev;
          const next = new Set(prev);
          if (in_call) next.add(userId);
          else next.delete(userId);
          return next;
        });
      },
    });

    return dispose;
  }, [socket]);

  return inCallSet;
}
