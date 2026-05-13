import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { z } from "zod";

import { mintLiveKitToken } from "@/lib/livekit/client";
import { recordMeetingCallLog } from "@/server/lib/call-log";
import { protectedProcedure, router } from "@/server/trpc/trpc";

import type { Prisma } from "@yelli/db";

export const meetingsRouter = router({
  /**
   * List meetings for the current tenant (most recent first, limit 100).
   * L6 tenant-guard auto-injects organization_id — no explicit where needed.
   * Never returns organization_id in the response shape.
   */
  list: protectedProcedure.query(async () => {
    const meetings = await prisma.meeting.findMany({
      take: 100,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        scheduled_at: true,
        started_at: true,
        ended_at: true,
        recording_enabled: true,
        lobby_enabled: true,
        locked: true,
        created_at: true,
        host: {
          select: {
            id: true,
            display_name: true,
            email: true,
          },
        },
        _count: {
          select: {
            participants: true,
            call_logs: true,
          },
        },
      },
    });

    return meetings;
  }),

  /**
   * Get a single meeting by ID.
   * Includes full details: meeting_link_token, livekit_room_name, participants.
   * Throws NOT_FOUND (not 403) to avoid leaking whether the meeting exists in another org.
   */
  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .query(async ({ input }) => {
      const meeting = await prisma.meeting.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          scheduled_at: true,
          started_at: true,
          ended_at: true,
          meeting_link_token: true,
          livekit_room_name: true,
          recording_enabled: true,
          lobby_enabled: true,
          locked: true,
          created_at: true,
          host: {
            select: {
              id: true,
              display_name: true,
              email: true,
            },
          },
          participants: {
            select: {
              id: true,
              role_in_meeting: true,
              joined_at: true,
              left_at: true,
              user: {
                select: { id: true, display_name: true, email: true },
              },
            },
          },
          _count: {
            select: {
              call_logs: true,
            },
          },
        },
      });

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found." });
      }

      return meeting;
    }),

  /**
   * Create a new meeting for the current tenant.
   * L6 auto-injects organization_id; host_user_id is set from ctx.user.id.
   * Generates meeting_link_token and livekit_room_name server-side.
   */
  create: protectedProcedure
    .input(
      z
        .object({
          title: z.string().min(1).max(300),
          description: z.string().max(2000).optional(),
          scheduled_at: z.coerce.date().nullable().optional(),
          recording_enabled: z.boolean().default(false),
          lobby_enabled: z.boolean().default(false),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      // L6 tenant-guard injects organization_id at runtime — cast satisfies
      // Prisma's strict create input type that demands organization_id at compile time.
      const data: Prisma.MeetingUncheckedCreateInput = {
        organization_id: ctx.organizationId,
        host_user_id: ctx.user.id,
        title: input.title,
        description: input.description ?? null,
        scheduled_at: input.scheduled_at ?? null,
        recording_enabled: input.recording_enabled,
        lobby_enabled: input.lobby_enabled,
        status: "scheduled",
        meeting_link_token: crypto.randomUUID(),
        livekit_room_name: `meeting-${crypto.randomUUID()}`,
      };

      const meeting = await prisma.meeting.create({
        data,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          scheduled_at: true,
          recording_enabled: true,
          lobby_enabled: true,
          meeting_link_token: true,
          livekit_room_name: true,
          created_at: true,
        },
      });

      return meeting;
    }),

  /**
   * Issue a LiveKit token for the caller to join a meeting room.
   * Marks the meeting as `active` and stamps `started_at` on first join when the
   * meeting is still `scheduled`. L6 tenant-guard enforces tenant isolation —
   * cross-tenant join attempts return NOT_FOUND (generic, no enumeration leak).
   */
  getJoinToken: protectedProcedure
    .input(z.object({ meetingId: z.string().cuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const meeting = await prisma.meeting.findUnique({
        where: { id: input.meetingId },
        select: {
          id: true,
          status: true,
          host_user_id: true,
          livekit_room_name: true,
          locked: true,
        },
      });

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found." });
      }

      const isHost = meeting.host_user_id === ctx.user.id;

      if (meeting.status === "cancelled" || meeting.status === "ended") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This meeting is no longer active.",
        });
      }

      if (meeting.locked && !isHost) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This meeting is locked. Only the host can join.",
        });
      }

      // Promote scheduled → active on first join.
      if (meeting.status === "scheduled") {
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { status: "active", started_at: new Date() },
        });
      }

      let token: string;
      let wsUrl: string;
      try {
        const result = mintLiveKitToken({
          identity: ctx.user.id,
          displayName: ctx.user.name ?? ctx.user.email ?? "Participant",
          roomName: meeting.livekit_room_name,
          canPublish: true,
        });
        token = result.token;
        wsUrl = result.wsUrl;
      } catch {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Video service is temporarily unavailable. Please try again.",
        });
      }

      return {
        token,
        wsUrl,
        roomName: meeting.livekit_room_name,
        isHost,
      };
    }),

  /**
   * End a meeting (host only) — sets status=ended, stamps ended_at, and writes
   * a CallLog row with the provided status and participant count. Idempotent:
   * subsequent calls for an already-ended meeting return the existing record
   * without writing additional CallLog rows.
   */
  end: protectedProcedure
    .input(
      z
        .object({
          meetingId: z.string().cuid(),
          participantCount: z.number().int().min(0).max(50).default(0),
          status: z
            .enum(["completed", "missed", "failed"])
            .default("completed"),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await prisma.meeting.findUnique({
        where: { id: input.meetingId },
        select: {
          id: true,
          status: true,
          host_user_id: true,
          started_at: true,
          ended_at: true,
        },
      });

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found." });
      }
      if (meeting.host_user_id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the host can end the meeting.",
        });
      }
      if (meeting.status === "ended") {
        return { ok: true, alreadyEnded: true } as const;
      }

      const now = new Date();
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: "ended", ended_at: now },
      });

      await recordMeetingCallLog({
        organizationId: ctx.organizationId,
        meetingId: meeting.id,
        callerUserId: ctx.user.id,
        startedAt: meeting.started_at ?? now,
        endedAt: now,
        participantCount: input.participantCount,
        status: input.status,
      });

      return { ok: true, alreadyEnded: false } as const;
    }),
});
