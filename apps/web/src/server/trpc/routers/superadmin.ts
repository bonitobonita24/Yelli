import { TRPCError } from "@trpc/server";
import { platformPrisma, writeAuditLog } from "@yelli/db";
import { z } from "zod";

import { serializeCsv, type CsvColumn } from "@/lib/reports/csv";
import { generateTablePdf, type PdfColumn } from "@/lib/reports/pdf";
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
// Revenue sub-router — platform-wide invoice aggregations for /superadmin/revenue
//
// Per PRODUCT.md line 113: "Revenue reports: revenue by period, by plan tier,
// by payment method — exportable CSV/PDF". Cross-tenant by design: uses
// platformPrisma (no L6) and is gated by superAdminProcedure.
//
// ⚠️ [[xendit-internal-id-in-api-wire]] — every Prisma select clause here MUST
// explicitly enumerate columns. NEVER use default-select-everything on Invoice
// or Subscription: those rows carry xendit_invoice_id, xendit_subscription_id
// which are internal-correlation IDs that must never leave the server.
// ----------------------------------------------------------------------------

const REVENUE_MAX_RANGE_DAYS = 366;

const revenueRangeInput = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .strict()
  .refine((v) => v.end > v.start, {
    message: "End date must be after start date.",
  })
  .refine(
    (v) =>
      (v.end.getTime() - v.start.getTime()) / (1000 * 60 * 60 * 24) <=
      REVENUE_MAX_RANGE_DAYS,
    { message: `Range must be at most ${REVENUE_MAX_RANGE_DAYS} days.` },
  );

type RevenueRange = z.infer<typeof revenueRangeInput>;

interface RevenueRow {
  period_month: string; // YYYY-MM (UTC)
  plan_tier: string;
  payment_method: string;
  invoice_count: number;
  paid_count: number;
  failed_count: number;
  refunded_count: number;
  paid_amount_php: number;
}

async function queryRevenue(range: RevenueRange): Promise<RevenueRow[]> {
  // EXPLICIT select clauses on BOTH Invoice and the nested subscription —
  // omits xendit_invoice_id, xendit_subscription_id, xendit_customer_id.
  // Add a row to this list ONLY if you also add it to the corresponding
  // CsvColumn/PdfColumn array below — see [[xendit-internal-id-in-api-wire]].
  const invoices = await platformPrisma.invoice.findMany({
    where: { issued_at: { gte: range.start, lte: range.end } },
    select: {
      id: true,
      amount_cents: true,
      currency: true,
      status: true,
      issued_at: true,
      subscription: {
        select: {
          plan_tier: true,
          payment_method: true,
        },
      },
    },
  });

  const buckets = new Map<string, RevenueRow>();
  for (const inv of invoices) {
    const period = inv.issued_at.toISOString().slice(0, 7);
    const plan = inv.subscription.plan_tier;
    const method = inv.subscription.payment_method ?? "-";
    const key = `${period} ${plan} ${method}`;
    let row = buckets.get(key);
    if (row === undefined) {
      row = {
        period_month: period,
        plan_tier: plan,
        payment_method: method,
        invoice_count: 0,
        paid_count: 0,
        failed_count: 0,
        refunded_count: 0,
        paid_amount_php: 0,
      };
      buckets.set(key, row);
    }
    row.invoice_count += 1;
    if (inv.status === "paid") {
      row.paid_count += 1;
      row.paid_amount_php += inv.amount_cents / 100;
    } else if (inv.status === "failed") {
      row.failed_count += 1;
    } else if (inv.status === "refunded") {
      row.refunded_count += 1;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.period_month !== b.period_month) {
      return a.period_month.localeCompare(b.period_month);
    }
    if (a.plan_tier !== b.plan_tier) return a.plan_tier.localeCompare(b.plan_tier);
    return a.payment_method.localeCompare(b.payment_method);
  });
}

const REVENUE_CSV_COLUMNS: ReadonlyArray<CsvColumn<RevenueRow>> = [
  { header: "period_month", accessor: (r) => r.period_month },
  { header: "plan_tier", accessor: (r) => r.plan_tier },
  { header: "payment_method", accessor: (r) => r.payment_method },
  { header: "invoice_count", accessor: (r) => r.invoice_count },
  { header: "paid_count", accessor: (r) => r.paid_count },
  { header: "failed_count", accessor: (r) => r.failed_count },
  { header: "refunded_count", accessor: (r) => r.refunded_count },
  { header: "paid_amount_php", accessor: (r) => r.paid_amount_php },
];

const REVENUE_PDF_COLUMNS: ReadonlyArray<PdfColumn<RevenueRow>> = [
  { header: "Period", accessor: (r) => r.period_month, width: 80 },
  { header: "Plan", accessor: (r) => r.plan_tier, width: 80 },
  { header: "Method", accessor: (r) => r.payment_method, width: 100 },
  { header: "Invoices", accessor: (r) => r.invoice_count, width: 70 },
  { header: "Paid", accessor: (r) => r.paid_count, width: 60 },
  { header: "Failed", accessor: (r) => r.failed_count, width: 60 },
  { header: "Refunded", accessor: (r) => r.refunded_count, width: 70 },
  { header: "Paid PHP", accessor: (r) => r.paid_amount_php, width: 100 },
];

function revenueFilename(start: Date, end: Date, ext: "csv" | "pdf"): string {
  return `platform-revenue-${start.toISOString().slice(0, 10)}-${end.toISOString().slice(0, 10)}.${ext}`;
}

const revenueRouter = router({
  /** Cross-tenant revenue summary CSV. Audit-logged PLATFORM:EXPORT_REVENUE. */
  exportRevenueCsv: superAdminProcedure
    .input(revenueRangeInput)
    .mutation(async ({ ctx, input }) => {
      const rows = await queryRevenue(input);
      await writeAuditLog(platformPrisma, {
        organizationId: null,
        userId: ctx.user.id,
        action: "PLATFORM:EXPORT_REVENUE_CSV",
        entity: "Invoice",
        entityId: `range:${input.start.toISOString()}..${input.end.toISOString()}`,
        before: null,
        after: { row_count: rows.length, format: "csv" },
      });
      return {
        filename: revenueFilename(input.start, input.end, "csv"),
        content: serializeCsv(rows, REVENUE_CSV_COLUMNS),
        row_count: rows.length,
      };
    }),

  /** Cross-tenant revenue summary PDF. Audit-logged PLATFORM:EXPORT_REVENUE. */
  exportRevenuePdf: superAdminProcedure
    .input(revenueRangeInput)
    .mutation(async ({ ctx, input }) => {
      const rows = await queryRevenue(input);
      const buf = await generateTablePdf({
        title: "Platform Revenue Summary",
        subtitle: `Range: ${input.start.toISOString().slice(0, 10)} → ${input.end.toISOString().slice(0, 10)}`,
        orgName: "Yelli Platform",
        columns: REVENUE_PDF_COLUMNS,
        rows,
      });
      await writeAuditLog(platformPrisma, {
        organizationId: null,
        userId: ctx.user.id,
        action: "PLATFORM:EXPORT_REVENUE_PDF",
        entity: "Invoice",
        entityId: `range:${input.start.toISOString()}..${input.end.toISOString()}`,
        before: null,
        after: { row_count: rows.length, format: "pdf" },
      });
      return {
        filename: revenueFilename(input.start, input.end, "pdf"),
        contentBase64: buf.toString("base64"),
        row_count: rows.length,
      };
    }),
});

// ----------------------------------------------------------------------------
// Composed superadmin router
// ----------------------------------------------------------------------------

export const superadminRouter = router({
  organizations: organizationsRouter,
  platformSettings: platformSettingsRouter,
  revenue: revenueRouter,
});
