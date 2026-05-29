/**
 * Overlay Cluster Sub-B — whiteboard realtime socket layer.
 *
 * Three bidirectional events: stroke (draw path), cursor (pointer position),
 * clear (wipe canvas). Per-meeting filtering is CLIENT-SIDE — payload carries
 * meetingId so a single socket connection serves all open meeting tabs without
 * needing per-meeting rooms (org-channel pattern locked 2026-05-25, realtime chat).
 *
 * Server enforces: Zod schema validation + byte-length caps on every inbound
 * event. Silent drop on failure — no error emit (high-frequency input path).
 * Cross-org gate: meetingId is verified against the caller's org before any
 * broadcast — matching the chat.send tRPC posture (prisma.meeting.findUnique).
 */
import { prisma } from "@yelli/db";
import { z } from "zod";

import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

// ─── exported event name constants ───────────────────────────────────────────

export const WHITEBOARD_STROKE_EVENT = "whiteboard:stroke";
export const WHITEBOARD_CURSOR_EVENT = "whiteboard:cursor";
export const WHITEBOARD_CLEAR_EVENT = "whiteboard:clear";

// ─── byte caps ───────────────────────────────────────────────────────────────

export const MAX_STROKE_BYTES = 32 * 1024; // 32 KB — upper bound for ~1 k points
export const MAX_CURSOR_BYTES = 512;

// ─── module-local Zod schemas (not exported) ─────────────────────────────────

const strokeInput = z.object({
  meetingId: z.string().min(1),
  strokeId: z.string().min(1),
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().int().min(1).max(50),
});

const cursorInput = z.object({
  meetingId: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

const clearInput = z.object({
  meetingId: z.string().min(1),
});

// ─── handler attach ──────────────────────────────────────────────────────────

/**
 * Attach whiteboard socket handlers to a newly connected socket.
 *
 * Joins the three org-scoped whiteboard channels then registers inbound
 * listeners. Each listener validates + size-checks before relaying via
 * emitToOrg. No-op when the socket has no authenticated session.
 */
export function attachWhiteboardHandlers(args: {
  io: IOServer;
  socket: Socket;
}): void {
  const { io, socket } = args;
  const session = socket.data.session as SocketSession | undefined;
  if (!session) return;

  const { organizationId } = session;

  joinOrgChannel(socket, WHITEBOARD_STROKE_EVENT);
  joinOrgChannel(socket, WHITEBOARD_CURSOR_EVENT);
  joinOrgChannel(socket, WHITEBOARD_CLEAR_EVENT);

  socket.on(WHITEBOARD_STROKE_EVENT, async (raw: unknown) => {
    const parsed = strokeInput.safeParse(raw);
    if (!parsed.success) return;
    const json = JSON.stringify(parsed.data);
    if (Buffer.byteLength(json, "utf8") > MAX_STROKE_BYTES) return;
    try {
      const meeting = await prisma.meeting.findUnique({
        where: { id: parsed.data.meetingId },
        select: { organization_id: true },
      });
      if (!meeting || meeting.organization_id !== organizationId) return;
    } catch {
      return;
    }
    emitToOrg(io, organizationId, WHITEBOARD_STROKE_EVENT, parsed.data);
  });

  socket.on(WHITEBOARD_CURSOR_EVENT, async (raw: unknown) => {
    const parsed = cursorInput.safeParse(raw);
    if (!parsed.success) return;
    const json = JSON.stringify(parsed.data);
    if (Buffer.byteLength(json, "utf8") > MAX_CURSOR_BYTES) return;
    try {
      const meeting = await prisma.meeting.findUnique({
        where: { id: parsed.data.meetingId },
        select: { organization_id: true },
      });
      if (!meeting || meeting.organization_id !== organizationId) return;
    } catch {
      return;
    }
    emitToOrg(io, organizationId, WHITEBOARD_CURSOR_EVENT, { ...parsed.data, userId: session.userId });
  });

  socket.on(WHITEBOARD_CLEAR_EVENT, async (raw: unknown) => {
    const parsed = clearInput.safeParse(raw);
    if (!parsed.success) return;
    try {
      const meeting = await prisma.meeting.findUnique({
        where: { id: parsed.data.meetingId },
        select: { organization_id: true },
      });
      if (!meeting || meeting.organization_id !== organizationId) return;
    } catch {
      return;
    }
    emitToOrg(io, organizationId, WHITEBOARD_CLEAR_EVENT, parsed.data);
  });
}
