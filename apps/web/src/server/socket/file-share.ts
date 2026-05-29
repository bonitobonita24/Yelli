/**
 * Overlay Cluster Sub-B′ — free-tier file-share socket transport.
 *
 * Free-tier users receive file data via socket broadcast only (no DB
 * persistence, no MinIO upload). The server enforces a hard 2 MB cap
 * computed from the base64 payload length before any broadcast occurs.
 *
 * Rejected events (size, MIME, invalid payload) are emitted exclusively
 * to the ORIGINATING socket via socket.emit — peers never see the
 * rejection. Accepted files are broadcast to all org peers via emitToOrg
 * using FILE_SHARE_BROADCAST_EVENT.
 *
 * Paid-tier persistence (tRPC + MinIO) flows through the sharedFiles
 * router and is completely separate from this module. This module is
 * socket-only transport — no database involvement whatsoever.
 */
import { z } from "zod";

import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

// ─── Public event name constants ────────────────────────────────────────────

/** Client → server: sender emits this with the file payload. */
export const FILE_SHARE_UPLOAD_EVENT = "file-share:upload";

/** Server → org peers: broadcast after successful validation. */
export const FILE_SHARE_BROADCAST_EVENT = "file-share:broadcast";

/** Server → originating socket only: emitted on any validation failure. */
export const FILE_SHARE_REJECTED_EVENT = "file-share:rejected";

/** Server-side hard cap for free-tier file transfers (2 MB). */
export const MAX_FREE_TIER_FILE_BYTES = 2 * 1024 * 1024;

// ─── Module-private validation ───────────────────────────────────────────────

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
]);

const uploadInput = z.object({
  meetingId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
});

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Attach file-share socket handlers to an authenticated socket.
 *
 * Joins the org broadcast channel immediately so the socket will receive
 * file broadcasts from peers. Binds the upload listener to validate and
 * relay (or reject) incoming file payloads.
 */
export function attachFileShareHandlers(args: {
  io: IOServer;
  socket: Socket;
}): void {
  const { io, socket } = args;
  const session = socket.data.session as SocketSession | undefined;
  if (!session) return;

  joinOrgChannel(socket, FILE_SHARE_BROADCAST_EVENT);

  socket.on(FILE_SHARE_UPLOAD_EVENT, (raw: unknown) => {
    const parsed = uploadInput.safeParse(raw);
    if (!parsed.success) {
      socket.emit(FILE_SHARE_REJECTED_EVENT, { reason: "invalid_payload" });
      return;
    }

    if (!ALLOWED_MIMES.has(parsed.data.mimeType)) {
      socket.emit(FILE_SHARE_REJECTED_EVENT, {
        reason: "mime_not_allowed",
        mimeType: parsed.data.mimeType,
      });
      return;
    }

    // Approximate decoded byte count from base64 length.
    // base64: every 4 chars encode 3 bytes → length * 3 / 4.
    const decodedBytes = Math.floor((parsed.data.base64Data.length * 3) / 4);
    if (decodedBytes > MAX_FREE_TIER_FILE_BYTES) {
      socket.emit(FILE_SHARE_REJECTED_EVENT, {
        reason: "too_large",
        maxBytes: MAX_FREE_TIER_FILE_BYTES,
      });
      return;
    }

    emitToOrg(io, session.organizationId, FILE_SHARE_BROADCAST_EVENT, {
      ...parsed.data,
      senderUserId: session.userId,
      sentAt: new Date().toISOString(),
    });
  });
}
