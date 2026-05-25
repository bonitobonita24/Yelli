import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import {
  buildStorageKey,
  getDownloadUrl,
  verifyKeyOwnership,
} from "@yelli/storage";
import { z } from "zod";

import {
  startRoomCompositeRecording,
  stopRoomEgress,
} from "@/lib/livekit/egress-client";
import { protectedProcedure, router } from "@/server/trpc/trpc";

const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;

export const recordingsRouter = router({
  /**
   * List recordings for the current tenant.
   * Most recent first. Excludes soft-deleted rows. L6 tenant-guard auto-injects
   * organization_id. Never returns file_path or organization_id to the client —
   * the client uses `id` to request a signed download URL.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          meetingId: z.string().cuid().optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(LIST_LIMIT_MAX)
            .default(LIST_LIMIT_DEFAULT),
        })
        .strict()
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Defense-in-depth: explicit org filter. recording.file_path also
      // carries an org prefix that verifyKeyOwnership checks on download.
      const recordings = await prisma.recording.findMany({
        where: {
          organization_id: ctx.organizationId,
          deleted_at: null,
          ...(input?.meetingId ? { meeting_id: input.meetingId } : {}),
        },
        take: input?.limit ?? LIST_LIMIT_DEFAULT,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          meeting_id: true,
          call_log_id: true,
          file_size_bytes: true,
          duration_seconds: true,
          storage_type: true,
          status: true,
          created_at: true,
          meeting: {
            select: { id: true, title: true, ended_at: true },
          },
          recorded_by: {
            select: { id: true, display_name: true, email: true },
          },
        },
      });

      // BigInt → string for JSON-safe transport. Numeric byte sizes can exceed
      // Number.MAX_SAFE_INTEGER on very large recordings.
      return recordings.map((r) => ({
        ...r,
        file_size_bytes: r.file_size_bytes.toString(),
      }));
    }),

  /**
   * Mint a time-limited pre-signed download URL for a recording.
   * Ownership is verified via the storage-key prefix (L5+L6 defence-in-depth).
   * On mismatch we return 404 — never 403 — to avoid confirming the recording
   * exists in another tenant.
   */
  getDownloadUrl: protectedProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const recording = await prisma.recording.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          file_path: true,
          status: true,
          deleted_at: true,
        },
      });

      if (!recording || recording.deleted_at !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recording not found." });
      }
      if (recording.status !== "ready") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Recording is not ready for download.",
        });
      }
      if (!verifyKeyOwnership(recording.file_path, ctx.organizationId)) {
        // Defence-in-depth — L6 should already have prevented this, but if the
        // tenant-guard ever drops, the storage-key check is the last line.
        throw new TRPCError({ code: "NOT_FOUND", message: "Recording not found." });
      }

      try {
        const { url, expiresAt } = await getDownloadUrl({
          storageKey: recording.file_path,
          expiresInSeconds: 3600,
        });
        return { url, expiresAt };
      } catch {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Download is temporarily unavailable. Please try again.",
        });
      }
    }),

  /**
   * Soft-delete a recording. Marks deleted_at and updates status; does NOT
   * remove the underlying S3 object (retention is governed by a background
   * sweeper aligned with the org's data-retention policy). Writes an
   * immutable AuditLog row inside the same transaction.
   */
  softDelete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.recording.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          file_path: true,
          status: true,
          deleted_at: true,
          meeting_id: true,
        },
      });

      if (!existing || existing.deleted_at !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recording not found." });
      }
      if (!verifyKeyOwnership(existing.file_path, ctx.organizationId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recording not found." });
      }

      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.recording.update({
          where: { id: existing.id },
          data: { deleted_at: now, status: "deleted" },
        });
        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "DELETE",
          entity: "Recording",
          entityId: existing.id,
          before: { status: existing.status, meeting_id: existing.meeting_id },
          after: { status: "deleted", deleted_at: now.toISOString() },
        });
      });

      return { ok: true } as const;
    }),

  /**
   * Start a RoomComposite Egress recording for the active call in a meeting.
   * Host-only (Meeting.host_user_id check). Inserts a Recording row in
   * status='processing'; the webhook (egress_ended) will flip it to 'ready'
   * once LiveKit finishes uploading the MP4 to MinIO.
   *
   * Locked decisions (DECISIONS_LOG.md — Phase 8 Batch B sub-3):
   *   - Egress mode: RoomCompositeEgress (single MP4 per meeting)
   *   - Storage:     MinIO via @yelli/storage S3 client
   *   - Permission:  Host only — Meeting.host_user_id === ctx.user.id
   */
  start: protectedProcedure
    .input(z.object({ meetingId: z.string().cuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const meeting = await prisma.meeting.findUnique({
        where: { id: input.meetingId },
        select: {
          id: true,
          organization_id: true,
          host_user_id: true,
          livekit_room_name: true,
          status: true,
        },
      });

      if (!meeting || meeting.organization_id !== ctx.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found.",
        });
      }
      if (meeting.host_user_id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the meeting host can start recording.",
        });
      }

      // Recording requires an active CallLog (FK is non-null). The meeting
      // must already be in a call — recording cannot precede the call.
      const activeCall = await prisma.callLog.findFirst({
        where: {
          organization_id: ctx.organizationId,
          meeting_id: meeting.id,
          ended_at: null,
        },
        orderBy: { started_at: "desc" },
        select: { id: true },
      });

      if (!activeCall) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Start the call before recording.",
        });
      }

      // Reject double-start. The Recording row alone is the source of
      // truth — Meeting.recording_enabled is a denormalised flag for UI.
      const existingActive = await prisma.recording.findFirst({
        where: {
          organization_id: ctx.organizationId,
          meeting_id: meeting.id,
          status: "processing",
          deleted_at: null,
        },
        select: { id: true },
      });
      if (existingActive) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Recording already in progress.",
        });
      }

      const storageKey = buildStorageKey(
        ctx.organizationId,
        "recordings",
        "mp4",
      );

      // Start Egress first — if LiveKit rejects we must not leave an
      // orphan Recording row. The DB writes only happen after a
      // successful start.
      let egressInfo;
      try {
        egressInfo = await startRoomCompositeRecording({
          roomName: meeting.livekit_room_name,
          storageKey,
        });
      } catch (err) {
        // Generic error to client — server-side log keeps the real cause.
        console.error(
          "[recordings.start] LiveKit Egress start failed:",
          err instanceof Error ? err.message : String(err),
        );
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Recording could not be started. Please try again.",
        });
      }

      const recording = await prisma.$transaction(async (tx) => {
        const created = await tx.recording.create({
          data: {
            organization_id: ctx.organizationId,
            meeting_id: meeting.id,
            call_log_id: activeCall.id,
            recorded_by_user_id: ctx.user.id,
            file_path: storageKey,
            storage_type: "s3",
            status: "processing",
            egress_id: egressInfo.egressId,
          },
          select: { id: true },
        });
        await tx.meeting.update({
          where: { id: meeting.id },
          data: { recording_enabled: true },
        });
        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.user.id,
          action: "CREATE",
          entity: "Recording",
          entityId: created.id,
          before: null,
          after: {
            meeting_id: meeting.id,
            egress_id: egressInfo.egressId,
            status: "processing",
          },
        });
        return created;
      });

      return { recordingId: recording.id, egressId: egressInfo.egressId };
    }),

  /**
   * Stop an active recording for a meeting. Host-only.
   * Tells LiveKit to wrap up — Recording row stays at 'processing' until
   * the egress_ended webhook arrives. Sets recording_enabled=false on
   * the Meeting immediately so the UI stops showing the live indicator.
   */
  stop: protectedProcedure
    .input(z.object({ meetingId: z.string().cuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const meeting = await prisma.meeting.findUnique({
        where: { id: input.meetingId },
        select: {
          id: true,
          organization_id: true,
          host_user_id: true,
        },
      });
      if (!meeting || meeting.organization_id !== ctx.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found.",
        });
      }
      if (meeting.host_user_id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the meeting host can stop recording.",
        });
      }

      const active = await prisma.recording.findFirst({
        where: {
          organization_id: ctx.organizationId,
          meeting_id: meeting.id,
          status: "processing",
          deleted_at: null,
        },
        select: { id: true, egress_id: true },
      });
      if (!active || !active.egress_id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active recording for this meeting.",
        });
      }

      try {
        await stopRoomEgress(active.egress_id);
      } catch (err) {
        // Best-effort stop. If LiveKit reports the egress already ended
        // we still flip the UI flag; the webhook completes the row.
        console.warn(
          "[recordings.stop] stopEgress returned error (treating as already-stopped):",
          err instanceof Error ? err.message : String(err),
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.meeting.update({
          where: { id: meeting.id },
          data: { recording_enabled: false },
        });
        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "Recording",
          entityId: active.id,
          before: { status: "processing" },
          after: { stop_requested: true },
        });
      });

      return { ok: true } as const;
    }),
});
