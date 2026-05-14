import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { z } from "zod";

import { mintLiveKitToken } from "@/lib/livekit/client";
import { emitIncomingCall, getIO } from "@/lib/socket/server";
import { recordIntercomCallLog } from "@/server/lib/call-log";
import { router, protectedProcedure } from "@/server/trpc/trpc";

export const callsRouter = router({
  /**
   * Initiates a 1:1 call to all users in a recipient department.
   * Mints a LiveKit token, emits a Socket.IO `call:incoming` event to the
   * department room, and returns connection details to the caller.
   */
  initiate: protectedProcedure
    .input(
      z.object({ recipientDepartmentId: z.string().cuid() }).strict(),
    )
    .mutation(async ({ ctx, input }) => {
      // L6 tenant-guard on prisma auto-injects organizationId — no explicit where needed.
      const department = await prisma.department.findUnique({
        where: { id: input.recipientDepartmentId },
        select: { id: true, name: true },
      });

      if (!department) {
        throw new TRPCError({
          code: "NOT_FOUND",
          // Generic message — do not reveal whether the dept exists in another org.
          message: "Recipient not found.",
        });
      }

      const callId = crypto.randomUUID();
      const roomName = crypto.randomUUID();

      let token: string;
      let wsUrl: string;

      try {
        const result = mintLiveKitToken({
          identity: ctx.userId,
          displayName: ctx.user.name ?? ctx.userId,
          roomName,
          canPublish: true,
        });
        token = result.token;
        wsUrl = result.wsUrl;
      } catch {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Call service is temporarily unavailable. Please try again.",
        });
      }

      const io = getIO();
      if (io !== null) {
        emitIncomingCall(io, {
          callerUserId: ctx.userId,
          recipientOrgId: ctx.organizationId,
          recipientDeptId: department.id,
          payload: {
            callId,
            callerName: ctx.user.name ?? ctx.userId,
            callerDepartment: null,
            roomName,
          },
        });
      }

      return {
        callId,
        roomName,
        token,
        wsUrl,
        recipientDepartmentName: department.name,
      };
    }),

  /**
   * Rejects an incoming call — notifies the caller via Socket.IO.
   */
  reject: protectedProcedure
    .input(
      z.object({ callId: z.string().min(1).max(128) }).strict(),
    )
    .mutation(({ input }) => {
      const io = getIO();
      if (io !== null) {
        io.to(`call:reject:${input.callId}`).emit("call:rejected", {
          callId: input.callId,
          reason: "declined",
        });
      }

      return { ok: true } as const;
    }),

  /**
   * Records the final state of a 1:1 intercom call. Called by the caller's
   * client when their LiveKit room disconnects (RoomEvent.Disconnected fires
   * after hangup or peer drop). Writes a single CallLog row.
   */
  end: protectedProcedure
    .input(
      z
        .object({
          callId: z.string().min(1).max(128),
          recipientDepartmentId: z.string().cuid().nullable().optional(),
          startedAt: z.coerce.date(),
          participantCount: z.number().int().min(0).max(50).default(2),
          status: z
            .enum(["completed", "missed", "failed"])
            .default("completed"),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await recordIntercomCallLog({
        organizationId: ctx.organizationId,
        callerUserId: ctx.user.id,
        recipientDepartmentId: input.recipientDepartmentId ?? null,
        startedAt: input.startedAt,
        endedAt: new Date(),
        participantCount: input.participantCount,
        status: input.status,
      });

      return { ok: true, callLogId: result.id } as const;
    }),

  /**
   * List call history for the current tenant (most recent first).
   * Powers /app/history. L6 tenant-guard auto-injects organization_id.
   * Includes caller, recipient/caller department, and (if applicable) the
   * meeting it belonged to. organization_id is never returned to the client.
   */
  listHistory: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(50),
          type: z.enum(["intercom", "meeting"]).optional(),
        })
        .strict()
        .optional(),
    )
    .query(async ({ input }) => {
      // Conditional spread keeps the literal type intact so the `select`
      // narrowing flows into the return type, while still satisfying
      // exactOptionalPropertyTypes (no `where: undefined`).
      const logs = await prisma.callLog.findMany({
        ...(input?.type ? { where: { call_type: input.type } } : {}),
        take: input?.limit ?? 50,
        orderBy: { started_at: "desc" },
        select: {
          id: true,
          call_type: true,
          status: true,
          started_at: true,
          ended_at: true,
          participant_count: true,
          meeting_id: true,
          caller: {
            select: { id: true, display_name: true, email: true },
          },
          caller_department: {
            select: { id: true, name: true },
          },
          recipient_department: {
            select: { id: true, name: true },
          },
          meeting: {
            select: { id: true, title: true },
          },
        },
      });

      return logs;
    }),
});
