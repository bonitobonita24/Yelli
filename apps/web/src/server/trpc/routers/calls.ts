import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { z } from "zod";

import { mintLiveKitToken } from "@/lib/livekit/client";
import { emitIncomingCall, getIO } from "@/lib/socket/server";
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
          displayName: ctx.session!.user.name ?? ctx.userId,
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
            callerName: ctx.session!.user.name ?? ctx.userId,
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
});
