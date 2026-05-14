import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { z } from "zod";

import { sanitizePlainText } from "@/server/lib/sanitize";
import { protectedProcedure, router } from "@/server/trpc/trpc";

import type { Prisma } from "@yelli/db";

const LIST_LIMIT_DEFAULT = 200;
const LIST_LIMIT_MAX = 500;
const MESSAGE_MAX_CHARS = 4000;

export const chatRouter = router({
  /**
   * List chat messages for a given meeting, oldest first (chronological).
   * Used by the in-call chat sidebar and the post-meeting chat-history viewer
   * at /app/chat/[meetingId]. L6 tenant-guard auto-injects organization_id and
   * cross-tenant access yields NOT_FOUND (generic — no enumeration leak).
   *
   * NOTE: nested includes for the sender User follow a foreign key that L6
   * created in the same tenant — safe per security.md §DATABASE SAFETY rule 7.
   */
  listByMeeting: protectedProcedure
    .input(
      z
        .object({
          meetingId: z.string().cuid(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(LIST_LIMIT_MAX)
            .default(LIST_LIMIT_DEFAULT),
        })
        .strict(),
    )
    .query(async ({ input }) => {
      // Confirm the meeting exists in the caller's tenant. L6 keeps this safe.
      const meeting = await prisma.meeting.findUnique({
        where: { id: input.meetingId },
        select: { id: true },
      });
      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found." });
      }

      const messages = await prisma.chatMessage.findMany({
        where: { meeting_id: input.meetingId },
        take: input.limit,
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          content: true,
          message_type: true,
          file_url: true,
          sender_guest_name: true,
          created_at: true,
          sender: {
            select: { id: true, display_name: true, email: true },
          },
        },
      });

      return messages;
    }),

  /**
   * Send a chat message into a meeting. Used both by in-call chat (during an
   * active meeting) and by the chat sidebar on /app/meeting/[id]. The host
   * may post `system` notices; everyone else sends `text`. File messages are
   * created via the file-dropzone upload flow which stores file_url and then
   * calls this procedure with message_type=file.
   *
   * Content is sanitized server-side before storage to prevent stored XSS.
   */
  send: protectedProcedure
    .input(
      z
        .object({
          meetingId: z.string().cuid(),
          content: z.string().min(1).max(MESSAGE_MAX_CHARS),
          messageType: z.enum(["text", "file"]).default("text"),
          fileUrl: z.string().min(1).max(2048).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.messageType === "file" && !input.fileUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid input.",
        });
      }

      const meeting = await prisma.meeting.findUnique({
        where: { id: input.meetingId },
        select: { id: true, status: true },
      });
      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found." });
      }
      if (meeting.status === "cancelled" || meeting.status === "ended") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This meeting is no longer active.",
        });
      }

      // L6 auto-injects organization_id at runtime — the unchecked input type
      // satisfies Prisma's strict create input that demands it at compile time.
      const data: Prisma.ChatMessageUncheckedCreateInput = {
        organization_id: ctx.organizationId,
        meeting_id: input.meetingId,
        sender_user_id: ctx.user.id,
        sender_guest_name: null,
        // Sanitize before storage — prevents stored XSS even if a future UI
        // surface accidentally renders message content as HTML.
        content: sanitizePlainText(input.content),
        message_type: input.messageType,
        file_url: input.fileUrl ?? null,
      };

      const message = await prisma.chatMessage.create({
        data,
        select: {
          id: true,
          content: true,
          message_type: true,
          file_url: true,
          sender_guest_name: true,
          created_at: true,
          sender: {
            select: { id: true, display_name: true, email: true },
          },
        },
      });

      return message;
    }),
});
