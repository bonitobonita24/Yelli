import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import { z } from "zod";

import {
  adminProcedure,
  protectedProcedure,
  router,
} from "@/server/trpc/trpc";

import type { Prisma } from "@yelli/db";

// ----------------------------------------------------------------------------
// Shared input schemas — strict() to reject unknown fields per security.md
// ----------------------------------------------------------------------------

const departmentBaseInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  group_label: z.string().trim().max(100).nullable().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
  auto_answer_enabled: z.boolean().optional(),
});

const createDepartmentInput = departmentBaseInput.strict();

const updateDepartmentInput = z
  .object({
    id: z.string().cuid(),
    data: departmentBaseInput.partial().strict(),
  })
  .strict();

const idInput = z.object({ id: z.string().cuid() }).strict();

const csvRowSchema = departmentBaseInput.strict();

const csvImportInput = z
  .object({
    rows: z.array(csvRowSchema).min(1).max(500),
  })
  .strict();

const setDefaultUserInput = z
  .object({
    departmentId: z.string().cuid(),
    userId: z.string().cuid().nullable(),
  })
  .strict();

// ----------------------------------------------------------------------------
// Router
// ----------------------------------------------------------------------------

export const departmentsRouter = router({
  /**
   * List all departments in the caller's org.
   * Defense-in-depth: explicit org filter in addition to L6 auto-injection.
   * Used by speed-dial board (any role) and /admin/departments (tenant_admin).
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const departments = await prisma.department.findMany({
      where: { organization_id: ctx.organizationId },
      orderBy: [{ group_label: "asc" }, { sort_order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        group_label: true,
        sort_order: true,
        auto_answer_enabled: true,
        device_binding_token: true,
        default_user_id: true,
        created_at: true,
        updated_at: true,
      },
    });
    return departments;
  }),

  /**
   * Return the ids of every Department whose default_user_id equals the caller.
   * Used by IncomingCallDialog (Phase 7 #16) to filter call:incoming broadcasts
   * down to calls actually destined for this user. L6 scopes to caller's org.
   *
   * Returns string[] (not single id) because Department.default_user_id has no
   * @unique constraint — one user may legitimately man multiple departments
   * (e.g. one receptionist covering both Front Desk and Reception). Read-only,
   * no AuditLog entry — L5 is for mutations.
   */
  myBoundDepartmentIds: protectedProcedure.query(async ({ ctx }) => {
    const rows = await prisma.department.findMany({
      where: {
        organization_id: ctx.organizationId,
        default_user_id: ctx.userId,
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }),

  /**
   * Create a new department. tenant_admin only.
   * organization_id supplied explicitly to satisfy Prisma strict TS; L6 still
   * enforces tenant safety at runtime (5d 🟤 decision — UncheckedCreateInput cast).
   */
  create: adminProcedure
    .input(createDepartmentInput)
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx) => {
        const created = await tx.department.create({
          data: {
            organization_id: ctx.organizationId,
            name: input.name,
            description: input.description ?? null,
            group_label: input.group_label ?? null,
            sort_order: input.sort_order ?? 0,
            auto_answer_enabled: input.auto_answer_enabled ?? false,
          } satisfies Prisma.DepartmentUncheckedCreateInput,
          select: { id: true, name: true },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "CREATE",
          entity: "Department",
          entityId: created.id,
          before: null,
          after: { name: created.name },
        });

        return created;
      });
    }),

  /**
   * Update a department. tenant_admin only. Partial fields supported.
   * IDOR-safe: L6 auto-scopes findUnique to the caller's org.
   */
  update: adminProcedure
    .input(updateDepartmentInput)
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.department.findUnique({
          where: { id: input.id },
          select: { id: true, name: true },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Department not found." });
        }

        const updated = await tx.department.update({
          where: { id: input.id },
          data: {
            ...(input.data.name !== undefined && { name: input.data.name }),
            ...(input.data.description !== undefined && {
              description: input.data.description,
            }),
            ...(input.data.group_label !== undefined && {
              group_label: input.data.group_label,
            }),
            ...(input.data.sort_order !== undefined && {
              sort_order: input.data.sort_order,
            }),
            ...(input.data.auto_answer_enabled !== undefined && {
              auto_answer_enabled: input.data.auto_answer_enabled,
            }),
          },
          select: { id: true, name: true },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "Department",
          entityId: updated.id,
          before: { name: existing.name },
          after: { name: updated.name },
        });

        return updated;
      });
    }),

  /**
   * Delete a department. tenant_admin only. CallLog references SetNull on cascade —
   * call history is preserved per security.md §DATABASE SAFETY.
   */
  delete: adminProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.department.findUnique({
        where: { id: input.id },
        select: { id: true, name: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Department not found." });
      }

      await tx.department.delete({ where: { id: input.id } });

      await writeAuditLog(tx, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "DELETE",
        entity: "Department",
        entityId: existing.id,
        before: { name: existing.name },
        after: null,
      });

      return { id: existing.id };
    });
  }),

  /**
   * Bulk-import departments from a parsed CSV (rows pre-validated client-side).
   * Per security.md §DATABASE SAFETY rule 9: every row scoped to caller's org;
   * never accept organization_id from client. Hard cap of 500 rows per call.
   */
  csvImport: adminProcedure
    .input(csvImportInput)
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx) => {
        const result = await tx.department.createMany({
          data: input.rows.map((row) => ({
            organization_id: ctx.organizationId,
            name: row.name,
            description: row.description ?? null,
            group_label: row.group_label ?? null,
            sort_order: row.sort_order ?? 0,
            auto_answer_enabled: row.auto_answer_enabled ?? false,
          })) satisfies Prisma.DepartmentUncheckedCreateInput[],
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "CREATE",
          entity: "Department",
          entityId: "csv-import",
          before: null,
          after: { count: result.count },
        });

        return { imported: result.count };
      });
    }),

  /**
   * Generate or regenerate the device_binding_token for a department.
   * Used to wire a fixed kiosk/tablet to a department for incoming-only calls.
   * The token is opaque + unique across the platform (Prisma @unique constraint).
   * tenant_admin only — exposing a token is equivalent to granting a device its identity.
   */
  regenerateDeviceToken: adminProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.department.findUnique({
          where: { id: input.id },
          select: { id: true, name: true },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Department not found." });
        }

        // Two concatenated UUIDs → 64 hex chars of crypto-quality entropy.
        const token = `dev_${crypto.randomUUID().replace(/-/g, "")}${crypto
          .randomUUID()
          .replace(/-/g, "")}`;

        await tx.department.update({
          where: { id: input.id },
          data: { device_binding_token: token },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "Department",
          entityId: existing.id,
          before: { device_binding_token: "[rotated]" },
          after: { device_binding_token: "[rotated]" },
        });

        // UI shows the token once with copy-to-clipboard; never retrievable after.
        return { id: existing.id, device_binding_token: token };
      });
    }),

  /**
   * Bind (or unbind) a Department's default user.
   * adminProcedure — tenant_admin only.
   * L6 tenant guard: findUnique returns null for cross-org IDs → NOT_FOUND.
   * userId: null clears the binding.
   * Inactive-user defense-in-depth check added in Task 8.
   * Audit log added in Task 9.
   */
  setDefaultUser: adminProcedure
    .input(setDefaultUserInput)
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx) => {
        const dept = await tx.department.findUnique({
          where: { id: input.departmentId },
          select: { id: true, name: true, default_user_id: true },
        });
        if (!dept) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Department not found.",
          });
        }

        if (input.userId !== null) {
          const user = await tx.user.findUnique({
            where: { id: input.userId },
            select: { id: true, status: true },
          });
          if (!user) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "User not found.",
            });
          }
          // Defense-in-depth: race where a user is deactivated between
          // dropdown render and form submit. Server is source of truth.
          if (user.status !== "active") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot bind an inactive user.",
            });
          }
        }

        const updated = await tx.department.update({
          where: { id: input.departmentId },
          data: { default_user_id: input.userId },
          select: { id: true, default_user_id: true },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "Department",
          entityId: updated.id,
          before: { default_user_id: dept.default_user_id },
          after: { default_user_id: updated.default_user_id },
        });

        return updated;
      });
    }),
});
