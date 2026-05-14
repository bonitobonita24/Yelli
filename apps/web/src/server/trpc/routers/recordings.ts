import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import { getDownloadUrl, verifyKeyOwnership } from "@yelli/storage";
import { z } from "zod";

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
    .query(async ({ input }) => {
      const recordings = await prisma.recording.findMany({
        where: {
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
});
