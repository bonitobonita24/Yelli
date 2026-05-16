/* eslint-disable no-console -- background loop logs failures to stderr; no
   request-scoped logger is available in a setInterval callback. */
/**
 * 60s session-revalidation loop.
 *
 * Every interval cycle, walk all connected sockets, fetch each user's
 * current state from the DB, and disconnect sockets whose session has
 * been invalidated since handshake. Implements:
 *   - security.md §Realtime Connection Safety: re-validate every 30-60s
 *   - security.md §AUTH DEFAULTS item 6: force-invalidate sessions on
 *     role / tenant / status change via security_version comparison
 *
 * The pure async function `revalidateConnectedSockets` is fully tested.
 * `startSessionRevalidationLoop` is the setInterval wrapper — its only
 * logic is "call the pure function every N ms, log failures, return
 * cleanup function" which is wiring not worth a separate test.
 */
// eslint-disable-next-line no-restricted-syntax -- Node-only background worker;
// Rule 13 restricts client consumption of @yelli/db, not server-side use.
import { platformPrisma } from "@yelli/db";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer } from "socket.io";


const DEFAULT_INTERVAL_MS = 60_000;

export async function revalidateConnectedSockets(args: {
  io: IOServer;
  prisma?: typeof platformPrisma;
}): Promise<{ disconnectedUserIds: string[]; checkedCount: number }> {
  const prisma = args.prisma ?? platformPrisma;
  const sockets = await args.io.fetchSockets();

  const userIds = [
    ...new Set(
      sockets
        .map((s) => {
          const session = s.data.session as SocketSession | undefined;
          return session?.userId;
        })
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  if (userIds.length === 0) {
    // Still walk sockets to disconnect any sessionless ones (defensive).
    for (const socket of sockets) {
      if (!(socket.data.session as SocketSession | undefined)) {
        socket.disconnect();
      }
    }
    return { disconnectedUserIds: [], checkedCount: sockets.length };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: { organization: { select: { suspended_at: true } } },
  });
  const usersById = new Map(users.map((u) => [u.id, u]));
  const disconnectedUserIds: string[] = [];

  for (const socket of sockets) {
    const session = socket.data.session as SocketSession | undefined;
    if (!session) {
      socket.disconnect();
      continue;
    }
    const user = usersById.get(session.userId);
    const isInvalid =
      !user ||
      user.status !== "active" ||
      user.organization.suspended_at !== null ||
      user.security_version !== session.securityVersion;

    if (isInvalid) {
      socket.emit("session:invalidated");
      socket.disconnect();
      disconnectedUserIds.push(session.userId);
    }
  }

  return { disconnectedUserIds, checkedCount: sockets.length };
}

/**
 * Start the periodic revalidation. Returns a cleanup function suitable
 * for SIGTERM handlers.
 */
export function startSessionRevalidationLoop(
  io: IOServer,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): () => void {
  const handle = setInterval(() => {
    revalidateConnectedSockets({ io }).catch((err: unknown) => {
      console.error("[socket] revalidation cycle failed:", err);
    });
  }, intervalMs);
  // Don't keep the Node process alive solely for this loop — Next.js owns
  // the lifecycle; we want process.exit when the request loop finishes.
  if (typeof handle.unref === "function") handle.unref();
  return () => clearInterval(handle);
}
