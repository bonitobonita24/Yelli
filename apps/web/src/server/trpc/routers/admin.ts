import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { adminProcedure, router } from "@/server/trpc/trpc";

// ----------------------------------------------------------------------------
// Users sub-router
// ----------------------------------------------------------------------------

const inviteUserInput = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    display_name: z.string().trim().min(1).max(200),
    role: z.enum(["tenant_admin", "host", "participant"]),
  })
  .strict();

const updateRoleInput = z
  .object({
    user_id: z.string().cuid(),
    role: z.enum(["tenant_admin", "host", "participant"]),
  })
  .strict();

const deactivateUserInput = z.object({ user_id: z.string().cuid() }).strict();

// 22-char temp password — must be changed on first sign-in. Returned to admin
// in plaintext exactly once so they can communicate it to the invitee out-of-band.
function generateTempPassword(): string {
  // 32 bytes → 43-char URL-safe base64; trim to 22 to align with framework policy.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "A")
    .replace(/\//g, "B")
    .replace(/=/g, "")
    .slice(0, 22);
}

const usersRouter = router({
  list: adminProcedure.query(async () => {
    // L6 scopes by org. Order by display_name ASC for stable admin UI.
    const users = await prisma.user.findMany({
      orderBy: { display_name: "asc" },
      select: {
        id: true,
        email: true,
        display_name: true,
        role: true,
        status: true,
        last_seen_at: true,
        is_super_admin: true,
        created_at: true,
      },
    });
    return users;
  }),

  invite: adminProcedure
    .input(inviteUserInput)
    .mutation(async ({ ctx, input }) => {
      const tempPassword = generateTempPassword();
      const hash = await bcrypt.hash(tempPassword, 12);

      return prisma.$transaction(async (tx) => {
        // Pre-check duplicate (org-scoped via L6). Generic error msg per security.md.
        const existing = await tx.user.findFirst({
          where: { email: input.email },
          select: { id: true },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A user with that email already exists in this organization.",
          });
        }

        const created = await tx.user.create({
          data: {
            organization_id: ctx.organizationId,
            email: input.email,
            display_name: input.display_name,
            password_hash: hash,
            role: input.role,
            status: "active",
          },
          select: { id: true, email: true, display_name: true, role: true },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "CREATE",
          entity: "User",
          entityId: created.id,
          before: null,
          after: { email: created.email, role: created.role },
        });

        // Plaintext returned ONCE — admin shares with invitee via secure channel.
        // Real email-based invite flow is Phase 7 work; this scaffold uses copy-paste.
        return { ...created, temp_password: tempPassword };
      });
    }),

  updateRole: adminProcedure
    .input(updateRoleInput)
    .mutation(async ({ ctx, input }) => {
      if (input.user_id === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own role.",
        });
      }

      return prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: input.user_id },
          select: { id: true, role: true, security_version: true, email: true },
        });
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        }

        const updated = await tx.user.update({
          where: { id: input.user_id },
          data: {
            role: input.role,
            // security.md L6: bump on role change → invalidates active sessions
            security_version: target.security_version + 1,
          },
          select: { id: true, role: true },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "User",
          entityId: updated.id,
          before: { role: target.role },
          after: { role: updated.role },
        });

        return updated;
      });
    }),

  deactivate: adminProcedure
    .input(deactivateUserInput)
    .mutation(async ({ ctx, input }) => {
      if (input.user_id === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot deactivate your own account.",
        });
      }

      return prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: input.user_id },
          select: {
            id: true,
            status: true,
            security_version: true,
            email: true,
          },
        });
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        }

        const next = target.status === "active" ? "inactive" : "active";

        const updated = await tx.user.update({
          where: { id: input.user_id },
          data: {
            status: next,
            // security.md L6: bump on status change → invalidates active sessions
            security_version: target.security_version + 1,
          },
          select: { id: true, status: true },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "User",
          entityId: updated.id,
          before: { status: target.status },
          after: { status: updated.status },
        });

        return updated;
      });
    }),
});

// ----------------------------------------------------------------------------
// Settings sub-router
// ----------------------------------------------------------------------------

const updateSettingsInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    billing_email: z.string().email().toLowerCase().trim(),
  })
  .strict();

const settingsRouter = router({
  get: adminProcedure.query(async ({ ctx }) => {
    // L6 cannot inject organization_id on findUnique-by-id; explicit lookup.
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        billing_email: true,
        plan_tier: true,
        subscription_status: true,
        suspended_at: true,
        created_at: true,
      },
    });
    if (!org) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
    }
    return org;
  }),

  update: adminProcedure
    .input(updateSettingsInput)
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx) => {
        const before = await tx.organization.findUnique({
          where: { id: ctx.organizationId },
          select: { name: true, billing_email: true },
        });
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Organization not found.",
          });
        }

        const updated = await tx.organization.update({
          where: { id: ctx.organizationId },
          data: { name: input.name, billing_email: input.billing_email },
          select: { id: true, name: true, billing_email: true },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "Organization",
          entityId: updated.id,
          before,
          after: { name: updated.name, billing_email: updated.billing_email },
        });

        return updated;
      });
    }),
});

// ----------------------------------------------------------------------------
// Reports sub-router — CSV export of call_logs
// ----------------------------------------------------------------------------

const exportCallLogsInput = z
  .object({
    // ISO-8601 datetime strings; bounded to 1-year range to prevent runaway exports
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .strict()
  .refine((v) => v.end >= v.start, { message: "end must be on or after start" })
  .refine(
    (v) => v.end.getTime() - v.start.getTime() <= 365 * 24 * 60 * 60 * 1000,
    { message: "Date range cannot exceed 365 days." },
  );

function csvEscape(value: string | number | Date | null): string {
  if (value === null) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const reportsRouter = router({
  exportCallLogsCsv: adminProcedure
    .input(exportCallLogsInput)
    .mutation(async ({ input }) => {
      // L6 scopes to caller's org. Hard upper limit prevents OOM on huge exports.
      const rows = await prisma.callLog.findMany({
        where: {
          started_at: { gte: input.start, lte: input.end },
        },
        orderBy: { started_at: "desc" },
        take: 10000,
        select: {
          id: true,
          started_at: true,
          ended_at: true,
          call_type: true,
          status: true,
          participant_count: true,
          caller_user_id: true,
          caller_department_id: true,
          recipient_department_id: true,
          meeting_id: true,
        },
      });

      const header = [
        "id",
        "started_at",
        "ended_at",
        "call_type",
        "status",
        "participant_count",
        "caller_user_id",
        "caller_department_id",
        "recipient_department_id",
        "meeting_id",
      ].join(",");

      const body = rows
        .map((r) =>
          [
            r.id,
            r.started_at,
            r.ended_at,
            r.call_type,
            r.status,
            r.participant_count,
            r.caller_user_id,
            r.caller_department_id,
            r.recipient_department_id,
            r.meeting_id,
          ]
            .map(csvEscape)
            .join(","),
        )
        .join("\n");

      return {
        filename: `call-logs-${input.start.toISOString().slice(0, 10)}-${input.end
          .toISOString()
          .slice(0, 10)}.csv`,
        content: `${header}\n${body}\n`,
        row_count: rows.length,
      };
    }),
});

// ----------------------------------------------------------------------------
// Dashboard sub-router — top-level metrics for /admin home
// ----------------------------------------------------------------------------

const dashboardRouter = router({
  /**
   * Aggregate stats for the admin home view: org counts + last-30-day call
   * volume time series for the dashboard chart. All scopes are L6-guarded.
   *
   * The time series is built in JS rather than a window function so it includes
   * zero-call days (which would be missing from raw GROUP BY).
   */
  stats: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [departmentCount, userCount, activeUserCount, org, recentCalls] =
      await Promise.all([
        prisma.department.count(),
        prisma.user.count(),
        prisma.user.count({ where: { status: "active" } }),
        prisma.organization.findUnique({
          where: { id: ctx.organizationId },
          select: { plan_tier: true, subscription_status: true },
        }),
        prisma.callLog.findMany({
          where: { started_at: { gte: thirtyDaysAgo } },
          select: { started_at: true, status: true, call_type: true },
          orderBy: { started_at: "asc" },
          take: 10000,
        }),
      ]);

    // Bucket recentCalls into a dense 30-day series (ISO date → count).
    const dayBuckets = new Map<string, number>();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayBuckets.set(key, 0);
    }
    for (const log of recentCalls) {
      const key = log.started_at.toISOString().slice(0, 10);
      dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
    }
    const callsTimeSeries = Array.from(dayBuckets.entries()).map(
      ([date, count]) => ({ date, count }),
    );

    const completedCalls = recentCalls.filter((c) => c.status === "completed").length;
    const missedCalls = recentCalls.filter((c) => c.status === "missed").length;

    return {
      departmentCount,
      userCount,
      activeUserCount,
      planTier: org?.plan_tier ?? "free",
      subscriptionStatus: org?.subscription_status ?? "trialing",
      callsLast30Days: recentCalls.length,
      completedCalls,
      missedCalls,
      callsTimeSeries,
    };
  }),
});

// ----------------------------------------------------------------------------
// Composed admin router
// ----------------------------------------------------------------------------

export const adminRouter = router({
  dashboard: dashboardRouter,
  users: usersRouter,
  settings: settingsRouter,
  reports: reportsRouter,
});
