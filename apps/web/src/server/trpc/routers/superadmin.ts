import { TRPCError } from "@trpc/server";
import { platformPrisma, writeAuditLog } from "@yelli/db";
import { z } from "zod";

import { router, superAdminProcedure } from "@/server/trpc/trpc";

// ============================================================================
// Super Admin — Platform-level operations
//
// Per security.md §SUPERADMIN AND PLATFORM-LEVEL ROLES:
// - All queries use platformPrisma (no L6 tenant-guard extension).
// - All operations logged via writeAuditLog with action prefix "PLATFORM:*".
// - Procedures use superAdminProcedure (auth + isSuperAdmin gate, no
//   runWithTenantContext) so tenant bypass is explicit, never implicit.
// ============================================================================

// ----------------------------------------------------------------------------
// Organizations sub-router
// ----------------------------------------------------------------------------

const listOrgsInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().cuid().nullish(),
    search: z.string().trim().max(200).optional(),
  })
  .strict();

const orgIdInput = z.object({ organization_id: z.string().cuid() }).strict();

const organizationsRouter = router({
  list: superAdminProcedure
    .input(listOrgsInput.optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 50;
      const items = await platformPrisma.organization.findMany({
        take: limit + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        ...(input?.search
          ? {
              where: {
                OR: [
                  { name: { contains: input.search, mode: "insensitive" } },
                  { slug: { contains: input.search, mode: "insensitive" } },
                  { billing_email: { contains: input.search, mode: "insensitive" } },
                ],
              },
            }
          : {}),
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          billing_email: true,
          plan_tier: true,
          subscription_status: true,
          suspended_at: true,
          created_at: true,
          _count: { select: { users: true, departments: true } },
        },
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const trailing = items.pop();
        nextCursor = trailing?.id ?? null;
      }

      return { items, nextCursor };
    }),

  byId: superAdminProcedure.input(orgIdInput).query(async ({ input }) => {
    const org = await platformPrisma.organization.findUnique({
      where: { id: input.organization_id },
      select: {
        id: true,
        name: true,
        slug: true,
        billing_email: true,
        plan_tier: true,
        subscription_status: true,
        suspended_at: true,
        created_at: true,
        _count: {
          select: {
            users: true,
            departments: true,
            meetings: true,
            call_logs: true,
          },
        },
      },
    });
    if (!org) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
    }
    return org;
  }),

  suspend: superAdminProcedure
    .input(orgIdInput)
    .mutation(async ({ ctx, input }) => {
      return platformPrisma.$transaction(async (tx) => {
        const before = await tx.organization.findUnique({
          where: { id: input.organization_id },
          select: { id: true, suspended_at: true, name: true },
        });
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Organization not found.",
          });
        }
        if (before.suspended_at !== null) {
          return { id: before.id, suspended_at: before.suspended_at, already: true };
        }

        const updated = await tx.organization.update({
          where: { id: input.organization_id },
          data: { suspended_at: new Date() },
          select: { id: true, suspended_at: true },
        });

        // Bump security_version on every active user → invalidates sessions
        // (security.md §AUTH DEFAULTS item 6 — session invalidation on tenant suspension).
        await tx.user.updateMany({
          where: { organization_id: input.organization_id, status: "active" },
          data: { security_version: { increment: 1 } },
        });

        await writeAuditLog(tx, {
          organizationId: null,
          userId: ctx.user.id,
          action: "PLATFORM:SUSPEND_ORG",
          entity: "Organization",
          entityId: updated.id,
          before: { suspended_at: null, name: before.name },
          after: { suspended_at: updated.suspended_at },
        });

        return { id: updated.id, suspended_at: updated.suspended_at, already: false };
      });
    }),

  unsuspend: superAdminProcedure
    .input(orgIdInput)
    .mutation(async ({ ctx, input }) => {
      return platformPrisma.$transaction(async (tx) => {
        const before = await tx.organization.findUnique({
          where: { id: input.organization_id },
          select: { id: true, suspended_at: true, name: true },
        });
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Organization not found.",
          });
        }
        if (before.suspended_at === null) {
          return { id: before.id, suspended_at: null, already: true };
        }

        const updated = await tx.organization.update({
          where: { id: input.organization_id },
          data: { suspended_at: null },
          select: { id: true, suspended_at: true },
        });

        await writeAuditLog(tx, {
          organizationId: null,
          userId: ctx.user.id,
          action: "PLATFORM:UNSUSPEND_ORG",
          entity: "Organization",
          entityId: updated.id,
          before: { suspended_at: before.suspended_at, name: before.name },
          after: { suspended_at: null },
        });

        return { id: updated.id, suspended_at: null, already: false };
      });
    }),
});

// ----------------------------------------------------------------------------
// Platform Settings sub-router (singleton row id="singleton")
// ----------------------------------------------------------------------------

const updatePlatformSettingsInput = z
  .object({
    free_tier_group_call_limit_minutes: z.number().int().min(1).max(1440).optional(),
    free_tier_max_participants: z.number().int().min(2).max(1000).optional(),
    pro_tier_price_cents: z.number().int().min(0).max(100000000).optional(),
    enterprise_tier_price_cents: z.number().int().min(0).max(100000000).optional(),
    recording_storage_quota_gb: z.number().int().min(1).max(100000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  });

const platformSettingsRouter = router({
  get: superAdminProcedure.query(async () => {
    const settings = await platformPrisma.platformSettings.findUnique({
      where: { id: "singleton" },
    });
    if (!settings) {
      // Singleton is seeded in Phase 4 Part 3 seed.ts; missing row = misconfigured prod
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Platform settings not initialized.",
      });
    }
    return settings;
  }),

  update: superAdminProcedure
    .input(updatePlatformSettingsInput)
    .mutation(async ({ ctx, input }) => {
      // Filter undefined keys — exactOptionalPropertyTypes rejects undefined values
      // in Prisma update inputs (only defined values may pass through).
      const updateData: Record<string, number> = {};
      if (input.free_tier_group_call_limit_minutes !== undefined)
        updateData.free_tier_group_call_limit_minutes =
          input.free_tier_group_call_limit_minutes;
      if (input.free_tier_max_participants !== undefined)
        updateData.free_tier_max_participants = input.free_tier_max_participants;
      if (input.pro_tier_price_cents !== undefined)
        updateData.pro_tier_price_cents = input.pro_tier_price_cents;
      if (input.enterprise_tier_price_cents !== undefined)
        updateData.enterprise_tier_price_cents = input.enterprise_tier_price_cents;
      if (input.recording_storage_quota_gb !== undefined)
        updateData.recording_storage_quota_gb = input.recording_storage_quota_gb;

      return platformPrisma.$transaction(async (tx) => {
        const before = await tx.platformSettings.findUnique({
          where: { id: "singleton" },
        });
        if (!before) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Platform settings not initialized.",
          });
        }

        const updated = await tx.platformSettings.update({
          where: { id: "singleton" },
          data: updateData,
        });

        await writeAuditLog(tx, {
          organizationId: null,
          userId: ctx.user.id,
          action: "PLATFORM:UPDATE_SETTINGS",
          entity: "PlatformSettings",
          entityId: "singleton",
          before: {
            free_tier_group_call_limit_minutes:
              before.free_tier_group_call_limit_minutes,
            free_tier_max_participants: before.free_tier_max_participants,
            pro_tier_price_cents: before.pro_tier_price_cents,
            enterprise_tier_price_cents: before.enterprise_tier_price_cents,
            recording_storage_quota_gb: before.recording_storage_quota_gb,
          },
          after: updateData,
        });

        return updated;
      });
    }),
});

// ----------------------------------------------------------------------------
// Composed superadmin router
// ----------------------------------------------------------------------------

export const superadminRouter = router({
  organizations: organizationsRouter,
  platformSettings: platformSettingsRouter,
});
