"use client";

/**
 * Phase 7 #10 — Socket.IO React Context provider.
 *
 * Wraps the authenticated app shell (apps/web/src/app/app/layout.tsx). On
 * mount in the browser it:
 *
 *   1. Creates ONE typed socket via `createSocketClient` pointed at
 *      `clientEnv.NEXT_PUBLIC_SOCKET_URL` (the separate socket server origin,
 *      port 43515 in dev — see PORTS in .cline/STATE.md). The socket is
 *      memoised in component state so subsequent renders re-use the same
 *      connection instead of opening a new one.
 *
 *   2. Attaches the `session:invalidated` listener via the pure helper
 *      `attachSessionInvalidationHandler`. When fired, the provider routes
 *      to `/login` via `router.push` + `router.refresh()` so any cached
 *      authenticated layouts are evicted.
 *
 *   3. Tears down on unmount: dispose the invalidation listener, call
 *      `socket.disconnect()`. Reconnection budget is capped at 5 attempts
 *      inside the factory (see client.ts:54).
 *
 * NEXT_PUBLIC_SOCKET_URL is optional in env.ts. When undefined (build that
 * pre-dates Phase 7 #8e, or a unit-test harness), the provider degrades
 * silently — `useSocketOptional()` returns null and `useSocket()` throws
 * with a clear message. This matches the graceful-degradation pattern in
 * apps/web/src/lib/presence/use-presence.ts which existed before the
 * Phase 7 #8e foundation was live.
 *
 * The provider is intentionally thin: every piece of testable behaviour
 * lives in client.ts (factory) or session-invalidation.ts (listener). The
 * jsx wrapper just composes them with React lifecycle + Next.js router —
 * exactly the surface that requires jsdom to test, which Yelli does not
 * have installed.
 */
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { clientEnv } from "@/env";
import { createSocketClient, type TypedSocket } from "@/lib/socket/client";
import { attachSessionInvalidationHandler } from "@/lib/socket/session-invalidation";

const SocketContext = createContext<TypedSocket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const socketUrl = clientEnv.NEXT_PUBLIC_SOCKET_URL;

  // Lazy-init: the socket is constructed at most once per provider lifetime.
  // SSR-safe — useState's initialiser runs on every render context (server
  // and client), but `createSocketClient` only touches `io()` which is a
  // pure constructor; no `window` access. The actual transport connection
  // happens inside `io()`'s internal first-attempt timer, deferred to the
  // client via useEffect mount semantics.
  const [socket] = useState<TypedSocket | null>(() => {
    if (socketUrl === undefined) return null;
    return createSocketClient({ url: socketUrl });
  });

  useEffect(() => {
    if (socket === null) return;

    const dispose = attachSessionInvalidationHandler(socket, () => {
      router.push("/login");
      router.refresh();
    });

    return () => {
      dispose();
      socket.disconnect();
    };
  }, [socket, router]);

  const contextValue = useMemo(() => socket, [socket]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Returns the active typed socket. Throws if called outside `SocketProvider`
 * or if `NEXT_PUBLIC_SOCKET_URL` is undefined — callers that need to handle
 * the absent case gracefully should use `useSocketOptional()` instead.
 */
export function useSocket(): TypedSocket {
  const socket = useContext(SocketContext);
  if (socket === null) {
    throw new Error(
      "useSocket must be called inside <SocketProvider> with NEXT_PUBLIC_SOCKET_URL set",
    );
  }
  return socket;
}

/** Returns the active typed socket, or null if the provider is absent / URL unset. */
export function useSocketOptional(): TypedSocket | null {
  return useContext(SocketContext);
}
