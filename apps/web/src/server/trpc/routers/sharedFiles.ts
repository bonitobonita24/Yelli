import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import {
  buildStorageKey,
  getDownloadUrl,
  getPresignedUploadUrl,
  verifyKeyOwnership,
} from "@yelli/storage";
import { z } from "zod";

import { requirePlanCapability } from "@/server/trpc/middleware/plan-limit";
import { middleware, protectedProcedure, router } from "@/server/trpc/trpc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pre-signed GET URL expiry — 1 hour */
const DOWNLOAD_URL_EXPIRY_SECONDS = 3600;
/**
 * Default file retention when org plan does not declare a specific value.
 * Pro/Enterprise get 30 days; free is gated by filePersistence capability check.
 */
const DEFAULT_RETENTION_DAYS = 30;

// ---------------------------------------------------------------------------
// Plan-gated middleware
// ---------------------------------------------------------------------------

/**
 * Delegates to requirePlanCapability at call time (not module-load time) so
 * vi.mock overrides in tests intercept every invocation. No casts needed —
 * plan-limit.ts now types `next` as Promise<MiddlewareResult<unknown>>, which
 * satisfies tRPC's MiddlewareFunction signature.
 */
const filePersistenceGuard = middleware(({ ctx, next }) =>
  requirePlanCapability("filePersistence")({ ctx, next }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate expires_at from plan-tier retention policy.
 * Falls back to DEFAULT_RETENTION_DAYS when the org has no explicit policy.
 */
function computeExpiresAt(retentionDays?: number | null): Date {
  const days =
    retentionDays != null && retentionDays > 0
      ? retentionDays
      : DEFAULT_RETENTION_DAYS;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const sharedFilesRouter = router({
  /**
   * Request a pre-signed S3 PUT URL so the client can upload directly to
   * storage without routing large blobs through the API tier.
   *
   * Returns the storage key (client must pass it back in `commit`) plus the
   * short-lived PUT URL. The file is NOT yet tracked in the DB — that happens
   * in `commit` after the upload succeeds.
   *
   * Gate: filePersistence plan capability required.
   */
  requestUpload: protectedProcedure
    .use(filePersistenceGuard)
    .input(
      z
        .object({
          meetingId: z.string().cuid(),
          filename: z.string().min(1).max(500),
          sizeBytes: z.number().int().positive(),
          mimeType: z.string().min(1).max(255),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const ext = input.filename.split(".").pop() ?? "";
      const storageKey = buildStorageKey(
        ctx.organizationId,
        "shared-file",
        ext,
      );

      const { url: uploadUrl } = await getPresignedUploadUrl({
        storageKey,
        contentType: input.mimeType,
        contentLength: input.sizeBytes,
        // 15-minute default is generous for a browser upload
      });

      return { uploadUrl, storageKey };
    }),

  /**
   * Commit a completed upload by creating a SharedFile row.
   *
   * The client calls this after the direct-to-storage PUT succeeds, passing
   * back the storage key returned by `requestUpload`. Sets is_persisted=true
   * and calculates expires_at from the org's retention policy.
   *
   * Gate: filePersistence plan capability required.
   */
  commit: protectedProcedure
    .use(filePersistenceGuard)
    .input(
      z
        .object({
          meetingId: z.string().cuid(),
          storageKey: z.string().min(1),
          filename: z.string().min(1).max(500),
          sizeBytes: z.number().int().positive(),
          mimeType: z.string().min(1).max(255),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the storage key was generated for this org — prevents a user
      // submitting another tenant's key. Return NOT_FOUND (enumeration guard).
      if (!verifyKeyOwnership(input.storageKey, ctx.organizationId)) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const expiresAt = computeExpiresAt(DEFAULT_RETENTION_DAYS);

      const file = await prisma.sharedFile.create({
        data: {
          organization_id: ctx.organizationId,
          meeting_id: input.meetingId,
          uploaded_by_user_id: ctx.userId,
          file_name: input.filename,
          file_path: input.storageKey,
          file_size_bytes: BigInt(input.sizeBytes),
          mime_type: input.mimeType,
          is_persisted: true,
          expires_at: expiresAt,
        },
      });

      await writeAuditLog(prisma, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "CREATE",
        entity: "SharedFile",
        entityId: file.id,
        before: null,
        after: {
          filename: input.filename,
          sizeBytes: input.sizeBytes,
          mimeType: input.mimeType,
        },
      });

      return {
        fileId: file.id,
        meetingId: file.meeting_id,
        filename: file.file_name,
        sizeBytes: Number(file.file_size_bytes),
        mimeType: file.mime_type,
        isPersisted: file.is_persisted,
        createdAt: file.created_at,
        expiresAt: file.expires_at,
      };
    }),

  /**
   * List shared files for a meeting, scoped to the caller's org.
   * L6 tenant-guard auto-injects organization_id. We still add an explicit
   * org filter as defence-in-depth (mirrors recordings.list pattern).
   *
   * Gate: filePersistence plan capability required.
   */
  listByMeeting: protectedProcedure
    .use(filePersistenceGuard)
    .input(
      z
        .object({
          meetingId: z.string().cuid(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      // Exclude soft-deleted rows (deleted_at IS NOT NULL) and naturally expired rows.
      const now = new Date();
      const files = await prisma.sharedFile.findMany({
        where: {
          organization_id: ctx.organizationId,
          meeting_id: input.meetingId,
          deleted_at: null,
          OR: [{ expires_at: null }, { expires_at: { gt: now } }],
        },
        orderBy: { created_at: "asc" },
      });

      return files.map((f) => ({
        fileId: f.id,
        meetingId: f.meeting_id,
        filename: f.file_name,
        sizeBytes: Number(f.file_size_bytes),
        mimeType: f.mime_type,
        isPersisted: f.is_persisted,
        createdAt: f.created_at,
        expiresAt: f.expires_at,
      }));
    }),

  /**
   * Get a short-lived pre-signed download URL for a shared file.
   * Verifies the storage key's org prefix matches the caller's org —
   * returns NOT_FOUND (not FORBIDDEN) on mismatch to prevent enumeration.
   *
   * Gate: filePersistence plan capability required.
   */
  getDownloadUrl: protectedProcedure
    .use(filePersistenceGuard)
    .input(
      z
        .object({
          fileId: z.string().cuid(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const file = await prisma.sharedFile.findUnique({
        where: { id: input.fileId },
        select: {
          id: true,
          organization_id: true,
          file_path: true,
          file_name: true,
          expires_at: true,
          deleted_at: true,
        },
      });

      if (!file || file.deleted_at !== null) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Enumeration guard: return NOT_FOUND instead of FORBIDDEN
      if (!verifyKeyOwnership(file.file_path, ctx.organizationId)) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { url, expiresAt } = await getDownloadUrl({
        storageKey: file.file_path,
        expiresInSeconds: DOWNLOAD_URL_EXPIRY_SECONDS,
      });

      return { url, expiresAt, filename: file.file_name };
    }),

  /**
   * Soft-delete a shared file.
   * Sets deleted_at to now; does NOT delete the underlying storage object.
   * Verifies ownership via storage key org prefix — returns NOT_FOUND on mismatch.
   *
   * Gate: filePersistence plan capability required.
   */
  softDelete: protectedProcedure
    .use(filePersistenceGuard)
    .input(
      z
        .object({
          fileId: z.string().cuid(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const file = await prisma.sharedFile.findUnique({
        where: { id: input.fileId },
        select: {
          id: true,
          organization_id: true,
          file_path: true,
          deleted_at: true,
        },
      });

      if (!file || file.deleted_at !== null) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Enumeration guard: return NOT_FOUND instead of FORBIDDEN
      if (!verifyKeyOwnership(file.file_path, ctx.organizationId)) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const deletedAt = new Date();
      await prisma.sharedFile.update({
        where: { id: file.id },
        data: { deleted_at: deletedAt },
      });

      await writeAuditLog(prisma, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "DELETE",
        entity: "SharedFile",
        entityId: file.id,
        before: { deletedAt: null },
        after: { deletedAt: deletedAt.toISOString() },
      });

      return { ok: true };
    }),
});
