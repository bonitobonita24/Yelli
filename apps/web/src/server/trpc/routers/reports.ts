import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { z } from "zod";

import { serializeCsv, type CsvColumn } from "@/lib/reports/csv";
import { generateTablePdf, type PdfColumn } from "@/lib/reports/pdf";
import { adminProcedure, router } from "@/server/trpc/trpc";

// ============================================================================
// Reports sub-router — tenant-scoped exports for /admin/reports
//
// PRODUCT.md (lines 117-121) declares four report types in v1:
//   - usage summary (this org)         → exportUsageSummaryCsv / Pdf
//   - call detail records              → exportCallLogsCsv / Pdf
//   - revenue summary (Super Admin)    → lives in superadminRouter (cross-tenant)
//   - department activity              → exportDeptActivityCsv / Pdf
//
// Every procedure is `adminProcedure` (tenant_admin only) and applies an
// explicit `organization_id` filter on top of L6 tenant-guard per security.md
// §DATABASE SAFETY rule 10 ("Export and report queries — tenant scoping
// MANDATORY: even on count() and aggregate()"). The L6 super-admin bypass
// trap from lessons.md 2026-05-19 — fixed — required this defense-in-depth.
// ============================================================================

const MAX_RANGE_DAYS = 366;

// Shared date-range input. `end` must be > `start` and within MAX_RANGE_DAYS
// to prevent runaway exports that could OOM the function on a large tenant.
const dateRangeInput = z
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
      MAX_RANGE_DAYS,
    { message: `Range must be at most ${MAX_RANGE_DAYS} days.` },
  );

type DateRange = z.infer<typeof dateRangeInput>;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeFilename(prefix: string, start: Date, end: Date, ext: "csv" | "pdf"): string {
  return `${prefix}-${isoDate(start)}-${isoDate(end)}.${ext}`;
}

function rangeSubtitle(start: Date, end: Date): string {
  return `Range: ${isoDate(start)} → ${isoDate(end)}`;
}

// ----------------------------------------------------------------------------
// Query layer — pure async functions that return rows. Re-used between the
// CSV and PDF variants of each report so the data shape can't drift between
// formats. Every query enforces organization_id defense-in-depth.
// ----------------------------------------------------------------------------

interface CallLogRow {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  call_type: string;
  status: string;
  participant_count: number;
  caller_user_id: string | null;
  caller_department_id: string | null;
  recipient_department_id: string | null;
  meeting_id: string | null;
}

// Hard cap matches the pre-refactor inline procedure in admin.ts. Date-range
// validation bounds the typical case; the cap is a last line of defence so a
// single export can't OOM the function on a high-volume tenant.
const CALL_LOG_EXPORT_CAP = 10000;

async function queryCallLogs(
  organization_id: string,
  range: DateRange,
): Promise<CallLogRow[]> {
  // Defense-in-depth: explicit org filter. CSV exports without org scoping
  // would dump every tenant's call_logs into one file (lessons.md 2026-05-19).
  const rows = await prisma.callLog.findMany({
    where: {
      organization_id,
      started_at: { gte: range.start, lte: range.end },
    },
    orderBy: { started_at: "desc" },
    take: CALL_LOG_EXPORT_CAP,
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
  return rows.map((r) => ({
    ...r,
    duration_seconds:
      r.ended_at !== null
        ? Math.round((r.ended_at.getTime() - r.started_at.getTime()) / 1000)
        : null,
  }));
}

interface UsageSummaryRow {
  date: string; // YYYY-MM-DD UTC
  meetings_count: number;
  recording_minutes: number;
  active_hosts: number;
}

async function queryUsageSummary(
  organization_id: string,
  range: DateRange,
): Promise<UsageSummaryRow[]> {
  // Two scoped queries — Meetings + Recordings — then aggregate in JS by UTC
  // day. Doing this client-side keeps the query simple and avoids DB-vendor
  // specific date_trunc helpers. Tenant defense-in-depth: explicit org filter.
  const [meetings, recordings] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        organization_id,
        started_at: { gte: range.start, lte: range.end, not: null },
      },
      select: { started_at: true, host_user_id: true },
    }),
    prisma.recording.findMany({
      where: {
        organization_id,
        created_at: { gte: range.start, lte: range.end },
      },
      select: { created_at: true, duration_seconds: true },
    }),
  ]);

  const byDay = new Map<
    string,
    { meetings: number; minutes: number; hosts: Set<string> }
  >();
  function bucket(day: string) {
    let agg = byDay.get(day);
    if (agg === undefined) {
      agg = { meetings: 0, minutes: 0, hosts: new Set() };
      byDay.set(day, agg);
    }
    return agg;
  }
  for (const m of meetings) {
    if (m.started_at === null) continue;
    const agg = bucket(isoDate(m.started_at));
    agg.meetings += 1;
    agg.hosts.add(m.host_user_id);
  }
  for (const r of recordings) {
    const agg = bucket(isoDate(r.created_at));
    agg.minutes += r.duration_seconds / 60;
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, agg]) => ({
      date,
      meetings_count: agg.meetings,
      recording_minutes: Math.round(agg.minutes * 10) / 10,
      active_hosts: agg.hosts.size,
    }));
}

interface DeptActivityRow {
  department_name: string;
  calls_received: number;
  calls_completed: number;
  completion_rate_percent: number;
  avg_duration_seconds: number;
}

async function queryDeptActivity(
  organization_id: string,
  range: DateRange,
): Promise<DeptActivityRow[]> {
  // Pull all departments in the org plus all call_logs in range whose
  // recipient_department_id is set. Aggregate in JS keyed by department.
  // This produces a row for EVERY department (even zero-call ones), which
  // is the operationally useful shape — admins want to see which depts had
  // no activity at all.
  const [departments, callLogs] = await Promise.all([
    prisma.department.findMany({
      where: { organization_id },
      orderBy: [{ group_label: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.callLog.findMany({
      where: {
        organization_id,
        started_at: { gte: range.start, lte: range.end },
        recipient_department_id: { not: null },
      },
      select: {
        recipient_department_id: true,
        status: true,
        started_at: true,
        ended_at: true,
      },
    }),
  ]);

  const byDept = new Map<
    string,
    { received: number; completed: number; durationSum: number }
  >();
  for (const c of callLogs) {
    if (c.recipient_department_id === null) continue;
    let agg = byDept.get(c.recipient_department_id);
    if (agg === undefined) {
      agg = { received: 0, completed: 0, durationSum: 0 };
      byDept.set(c.recipient_department_id, agg);
    }
    agg.received += 1;
    if (c.status === "completed" && c.ended_at !== null) {
      agg.completed += 1;
      agg.durationSum += Math.round(
        (c.ended_at.getTime() - c.started_at.getTime()) / 1000,
      );
    }
  }

  return departments.map((d) => {
    const agg = byDept.get(d.id) ?? { received: 0, completed: 0, durationSum: 0 };
    return {
      department_name: d.name,
      calls_received: agg.received,
      calls_completed: agg.completed,
      completion_rate_percent:
        agg.received === 0
          ? 0
          : Math.round((agg.completed / agg.received) * 1000) / 10,
      avg_duration_seconds:
        agg.completed === 0 ? 0 : Math.round(agg.durationSum / agg.completed),
    };
  });
}

// ----------------------------------------------------------------------------
// Column definitions — shared between CSV and PDF variants of each report.
// Listing columns explicitly is the security boundary per
// [[xendit-internal-id-in-api-wire]]: only what's named here ships to the
// browser, regardless of what the underlying Prisma row carries.
// ----------------------------------------------------------------------------

// Column order kept stable for downstream tooling that may have been built
// against the pre-refactor CSV shape (id, started_at, ended_at, ...).
const CALL_LOG_CSV_COLUMNS: ReadonlyArray<CsvColumn<CallLogRow>> = [
  { header: "id", accessor: (r) => r.id },
  { header: "started_at", accessor: (r) => r.started_at },
  { header: "ended_at", accessor: (r) => r.ended_at },
  { header: "duration_seconds", accessor: (r) => r.duration_seconds },
  { header: "call_type", accessor: (r) => r.call_type },
  { header: "status", accessor: (r) => r.status },
  { header: "participant_count", accessor: (r) => r.participant_count },
  { header: "caller_user_id", accessor: (r) => r.caller_user_id },
  { header: "caller_department_id", accessor: (r) => r.caller_department_id },
  { header: "recipient_department_id", accessor: (r) => r.recipient_department_id },
  { header: "meeting_id", accessor: (r) => r.meeting_id },
];

const CALL_LOG_PDF_COLUMNS: ReadonlyArray<PdfColumn<CallLogRow>> = [
  { header: "Started", accessor: (r) => r.started_at, width: 110 },
  { header: "Ended", accessor: (r) => r.ended_at, width: 110 },
  { header: "Dur (s)", accessor: (r) => r.duration_seconds, width: 50 },
  { header: "Type", accessor: (r) => r.call_type, width: 60 },
  { header: "Status", accessor: (r) => r.status, width: 60 },
  { header: "#", accessor: (r) => r.participant_count, width: 30 },
  { header: "Caller User", accessor: (r) => r.caller_user_id, width: 120 },
  { header: "Caller Dept", accessor: (r) => r.caller_department_id, width: 120 },
  { header: "Recipient Dept", accessor: (r) => r.recipient_department_id, width: 120 },
];

const USAGE_CSV_COLUMNS: ReadonlyArray<CsvColumn<UsageSummaryRow>> = [
  { header: "date", accessor: (r) => r.date },
  { header: "meetings_count", accessor: (r) => r.meetings_count },
  { header: "recording_minutes", accessor: (r) => r.recording_minutes },
  { header: "active_hosts", accessor: (r) => r.active_hosts },
];

const USAGE_PDF_COLUMNS: ReadonlyArray<PdfColumn<UsageSummaryRow>> = [
  { header: "Date", accessor: (r) => r.date, width: 120 },
  { header: "Meetings", accessor: (r) => r.meetings_count, width: 100 },
  { header: "Recording min", accessor: (r) => r.recording_minutes, width: 140 },
  { header: "Active hosts", accessor: (r) => r.active_hosts, width: 140 },
];

const DEPT_CSV_COLUMNS: ReadonlyArray<CsvColumn<DeptActivityRow>> = [
  { header: "department_name", accessor: (r) => r.department_name },
  { header: "calls_received", accessor: (r) => r.calls_received },
  { header: "calls_completed", accessor: (r) => r.calls_completed },
  { header: "completion_rate_percent", accessor: (r) => r.completion_rate_percent },
  { header: "avg_duration_seconds", accessor: (r) => r.avg_duration_seconds },
];

const DEPT_PDF_COLUMNS: ReadonlyArray<PdfColumn<DeptActivityRow>> = [
  { header: "Department", accessor: (r) => r.department_name, width: 200 },
  { header: "Received", accessor: (r) => r.calls_received, width: 100 },
  { header: "Completed", accessor: (r) => r.calls_completed, width: 100 },
  { header: "Completion %", accessor: (r) => r.completion_rate_percent, width: 120 },
  { header: "Avg dur (s)", accessor: (r) => r.avg_duration_seconds, width: 120 },
];

// ----------------------------------------------------------------------------
// Organization name lookup for PDF headers. Cached per request (one call per
// procedure). Throws NOT_FOUND if the org disappeared between the session
// being minted and the export running — protects against using a stale org
// name in a leaked export from a now-suspended tenant.
// ----------------------------------------------------------------------------

async function getOrgName(organization_id: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organization_id },
    select: { name: true },
  });
  if (org === null) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
  }
  return org.name;
}

// ----------------------------------------------------------------------------
// Router — six procedures (three reports × two formats).
//
// Wire shapes:
//   CSV: { filename, content: string, row_count }   (text/csv, UTF-8)
//   PDF: { filename, contentBase64: string, row_count }   (base64 of Buffer)
//
// The client decodes contentBase64 with atob() + creates a Blob with
// type: "application/pdf" then triggers a browser download.
// ----------------------------------------------------------------------------

export const reportsRouter = router({
  /**
   * Export call detail records (CDR) for the caller's org as CSV.
   *
   * Pre-existing procedure relocated from `admin.ts` to consolidate Reports.
   * The wire path stays `admin.reports.exportCallLogsCsv` because adminRouter
   * still nests this router under `reports:` — existing UI keeps working.
   */
  exportCallLogsCsv: adminProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      const rows = await queryCallLogs(ctx.organizationId, input);
      const content = serializeCsv(rows, CALL_LOG_CSV_COLUMNS);
      return {
        filename: rangeFilename("call-logs", input.start, input.end, "csv"),
        content,
        row_count: rows.length,
      };
    }),

  /** Export CDR for the caller's org as PDF (landscape A4 tabular). */
  exportCallLogsPdf: adminProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      const [rows, orgName] = await Promise.all([
        queryCallLogs(ctx.organizationId, input),
        getOrgName(ctx.organizationId),
      ]);
      const buf = await generateTablePdf({
        title: "Call Detail Records",
        subtitle: rangeSubtitle(input.start, input.end),
        orgName,
        columns: CALL_LOG_PDF_COLUMNS,
        rows,
      });
      return {
        filename: rangeFilename("call-logs", input.start, input.end, "pdf"),
        contentBase64: buf.toString("base64"),
        row_count: rows.length,
      };
    }),

  /** Export daily usage summary for the caller's org as CSV. */
  exportUsageSummaryCsv: adminProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      const rows = await queryUsageSummary(ctx.organizationId, input);
      const content = serializeCsv(rows, USAGE_CSV_COLUMNS);
      return {
        filename: rangeFilename("usage-summary", input.start, input.end, "csv"),
        content,
        row_count: rows.length,
      };
    }),

  /** Export daily usage summary for the caller's org as PDF. */
  exportUsageSummaryPdf: adminProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      const [rows, orgName] = await Promise.all([
        queryUsageSummary(ctx.organizationId, input),
        getOrgName(ctx.organizationId),
      ]);
      const buf = await generateTablePdf({
        title: "Usage Summary",
        subtitle: rangeSubtitle(input.start, input.end),
        orgName,
        columns: USAGE_PDF_COLUMNS,
        rows,
      });
      return {
        filename: rangeFilename("usage-summary", input.start, input.end, "pdf"),
        contentBase64: buf.toString("base64"),
        row_count: rows.length,
      };
    }),

  /** Export per-department activity for the caller's org as CSV. */
  exportDeptActivityCsv: adminProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      const rows = await queryDeptActivity(ctx.organizationId, input);
      const content = serializeCsv(rows, DEPT_CSV_COLUMNS);
      return {
        filename: rangeFilename("dept-activity", input.start, input.end, "csv"),
        content,
        row_count: rows.length,
      };
    }),

  /** Export per-department activity for the caller's org as PDF. */
  exportDeptActivityPdf: adminProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      const [rows, orgName] = await Promise.all([
        queryDeptActivity(ctx.organizationId, input),
        getOrgName(ctx.organizationId),
      ]);
      const buf = await generateTablePdf({
        title: "Department Activity",
        subtitle: rangeSubtitle(input.start, input.end),
        orgName,
        columns: DEPT_PDF_COLUMNS,
        rows,
      });
      return {
        filename: rangeFilename("dept-activity", input.start, input.end, "pdf"),
        contentBase64: buf.toString("base64"),
        row_count: rows.length,
      };
    }),
});
