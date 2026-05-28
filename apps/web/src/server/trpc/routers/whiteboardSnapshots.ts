import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import { z } from "zod";

import { requirePlanCapability } from "@/server/trpc/middleware/plan-limit";
import { middleware, protectedProcedure, router } from "@/server/trpc/trpc";

import type { Prisma } from "@yelli/db";

// ---------------------------------------------------------------------------
// Plan-gated middleware
// ---------------------------------------------------------------------------

/**
 * Delegates to requirePlanCapability at call time (not module-load time) so
 * vi.mock overrides in tests intercept every invocation.
 */
const whiteboardPersistenceGuard = middleware(({ ctx, next }) =>
  requirePlanCapability("whiteboardPersistence")({ ctx, next }),
);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const whiteboardSnapshotsRouter = router({
  /**
   * Persist a whiteboard snapshot for a meeting.
   *
   * Verifies the meeting belongs to the caller's org before creating the row
   * (enumeration guard — returns NOT_FOUND on mismatch).
   *
   * Gate: whiteboardPersistence plan capability required.
   */
  save: protectedProcedure
    .use(whiteboardPersistenceGuard)
    .input(
      z
        .object({
          meetingId: z.string().cuid(),
          snapshotData: z.unknown(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await prisma.meeting.findFirst({
        where: { id: input.meetingId, organization_id: ctx.organizationId },
        select: { id: true },
      });

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const row = await prisma.whiteboardSnapshot.create({
        data: {
          organization_id: ctx.organizationId,
          meeting_id: input.meetingId,
          snapshot_data: input.snapshotData as Prisma.InputJsonValue,
          is_persisted: true,
        },
      });

      await writeAuditLog(prisma, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "CREATE",
        entity: "WhiteboardSnapshot",
        entityId: row.id,
        before: null,
        after: { meetingId: input.meetingId },
      });

      return {
        snapshotId: row.id,
        meetingId: row.meeting_id,
        isPersisted: row.is_persisted,
        createdAt: row.created_at,
      };
    }),

  /**
   * Retrieve the most recent persisted snapshot for a meeting.
   *
   * Returns null when no snapshot exists yet.
   *
   * Gate: whiteboardPersistence plan capability required.
   */
  getLatest: protectedProcedure
    .use(whiteboardPersistenceGuard)
    .input(
      z
        .object({
          meetingId: z.string().cuid(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const row = await prisma.whiteboardSnapshot.findFirst({
        where: {
          organization_id: ctx.organizationId,
          meeting_id: input.meetingId,
        },
        orderBy: { created_at: "desc" },
      });

      if (!row) {
        return null;
      }

      return {
        snapshotId: row.id,
        meetingId: row.meeting_id,
        snapshotData: row.snapshot_data,
        isPersisted: row.is_persisted,
        createdAt: row.created_at,
      };
    }),
});
