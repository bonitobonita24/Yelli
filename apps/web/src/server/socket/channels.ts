/**
 * Org-scoped channel naming + subscription helpers.
 *
 * DECISIONS_LOG.md (line 173, locked 2026-05-11) declares channel naming
 * as `${tenantId}:${eventType}` — tenant = organization in Yelli's schema.
 * NEVER broadcast globally; cross-org subscription is prevented by the
 * absence of an org-id parameter in `joinOrgChannel` (the helper sources
 * the org id from `socket.data.session`, which the auth middleware
 * populated and verified in (e)-1).
 *
 * The `platform:*` channels are reserved for super-admin events (tenant
 * disabled, billing past due, platform announcements). Joining requires
 * `session.isSuperAdmin === true` — checked at `joinPlatformChannel`,
 * not at `emitToPlatform` (the emit side has no socket to authorize;
 * server-side code controls when it emits, the subscribe side is the
 * authorization point).
 */
import type { Server as IOServer, Socket } from "socket.io";

const PLATFORM_PREFIX = "platform";

export function orgChannelName(organizationId: string, eventType: string): string {
  return `${organizationId}:${eventType}`;
}

export function platformChannelName(eventType: string): string {
  return `${PLATFORM_PREFIX}:${eventType}`;
}

/**
 * Subscribe the socket to its OWN org's channel for an event type.
 * Returns true on success, false if the socket has no session (which
 * should never happen post-auth-middleware — defensive guard only).
 *
 * SECURITY: there is no `organizationId` parameter on purpose. The socket
 * can only ever subscribe to rooms scoped to its `session.organizationId`.
 * A malicious client cannot coerce subscription to another org's channel
 * through this API surface.
 */
export function joinOrgChannel(socket: Socket, eventType: string): boolean {
  const session = socket.data.session;
  if (!session) return false;
  socket.join(orgChannelName(session.organizationId, eventType));
  return true;
}

/**
 * Subscribe a super-admin socket to a platform-wide channel. Rejects
 * non-super-admin sessions and sessionless sockets.
 */
export function joinPlatformChannel(socket: Socket, eventType: string): boolean {
  const session = socket.data.session;
  if (!session?.isSuperAdmin) return false;
  socket.join(platformChannelName(eventType));
  return true;
}

/** Emit a payload to every socket subscribed to an org's event channel. */
export function emitToOrg(
  io: IOServer,
  organizationId: string,
  eventType: string,
  payload: unknown,
): void {
  io.to(orgChannelName(organizationId, eventType)).emit(eventType, payload);
}

/** Emit a payload to the platform-wide channel (super-admin subscribers). */
export function emitToPlatform(
  io: IOServer,
  eventType: string,
  payload: unknown,
): void {
  io.to(platformChannelName(eventType)).emit(eventType, payload);
}
