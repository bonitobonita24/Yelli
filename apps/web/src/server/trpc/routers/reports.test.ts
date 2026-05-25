import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { reportsRouter } from "@/server/trpc/routers/reports";
import { createCallerFactory } from "@/server/trpc/trpc";

vi.mock("@yelli/db", () => ({
  prisma: {
    callLog: { findMany: vi.fn() },
    meeting: { findMany: vi.fn() },
    recording: { findMany: vi.fn() },
    department: { findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    auth: { check: vi.fn() },
    api: { check: vi.fn() },
    public: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

const createCaller = createCallerFactory(reportsRouter);

const ORG_A = "clh3z8t3d0001qzpqorgaaaaaa";
const ORG_B = "clh3z8t3d0002qzpqorgbbbbbb";

const ADMIN_SESSION = {
  id: "clh3z8t3d0010qzpqadminaaa",
  email: "admin@a.example",
  name: "Admin A",
  displayName: "Admin A",
  organizationId: ORG_A,
  organizationSlug: "org-a",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

const HOST_SESSION = {
  ...ADMIN_SESSION,
  id: "clh3z8t3d0011qzpqhostaaa",
  role: "host" as const,
};

function makeCtx(
  session: typeof ADMIN_SESSION | typeof HOST_SESSION = ADMIN_SESSION,
) {
  return {
    session: { user: session, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/admin.reports.x", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const RANGE_INPUT = {
  start: new Date("2026-01-01T00:00:00.000Z"),
  end: new Date("2026-01-31T23:59:59.000Z"),
};

const PDF_MAGIC_B64 = Buffer.from("%PDF-", "ascii").toString("base64").slice(0, 6);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.organization.findUnique).mockResolvedValue({
    name: "Acme Corp",
  } as never);
  vi.mocked(prisma.callLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.meeting.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.recording.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.department.findMany).mockResolvedValue([] as never);
});

// ============================================================================
// Tenant scoping — every query MUST carry explicit organization_id
// Per security.md §DATABASE SAFETY rule 10 + lessons.md 2026-05-19 super-admin
// bypass trap. Tests use a regular tenant_admin to confirm defense-in-depth.
// ============================================================================

describe("reports — explicit organization_id on every query", () => {
  it("exportCallLogsCsv passes org_id to callLog.findMany", async () => {
    const caller = createCaller(makeCtx());
    await caller.exportCallLogsCsv(RANGE_INPUT);
    expect(prisma.callLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_A }),
      }),
    );
    expect(prisma.callLog.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_B }),
      }),
    );
  });

  it("exportUsageSummaryCsv passes org_id to meeting + recording queries", async () => {
    const caller = createCaller(makeCtx());
    await caller.exportUsageSummaryCsv(RANGE_INPUT);
    expect(prisma.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_A }),
      }),
    );
    expect(prisma.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_A }),
      }),
    );
  });

  it("exportDeptActivityCsv passes org_id to department + callLog queries", async () => {
    const caller = createCaller(makeCtx());
    await caller.exportDeptActivityCsv(RANGE_INPUT);
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG_A },
      }),
    );
    expect(prisma.callLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_A }),
      }),
    );
  });
});

// ============================================================================
// RBAC — adminProcedure gate fires before any DB call
// ============================================================================

describe("reports — RBAC", () => {
  it("rejects non-admin role with FORBIDDEN, no DB touch", async () => {
    const caller = createCaller(makeCtx(HOST_SESSION));
    await expect(caller.exportCallLogsCsv(RANGE_INPUT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(prisma.callLog.findMany).not.toHaveBeenCalled();
  });

  it("rejects non-admin on PDF variant too", async () => {
    const caller = createCaller(makeCtx(HOST_SESSION));
    await expect(caller.exportUsageSummaryPdf(RANGE_INPUT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(prisma.meeting.findMany).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Date range validation
// ============================================================================

describe("reports — date range validation", () => {
  it("rejects end <= start with BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.exportCallLogsCsv({
        start: new Date("2026-02-01T00:00:00.000Z"),
        end: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.callLog.findMany).not.toHaveBeenCalled();
  });

  it("rejects range > 366 days with BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.exportCallLogsCsv({
        start: new Date("2025-01-01T00:00:00.000Z"),
        end: new Date("2026-06-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.callLog.findMany).not.toHaveBeenCalled();
  });
});

// ============================================================================
// CSV output shape
// ============================================================================

describe("reports CSV output", () => {
  it("exportCallLogsCsv: filename ends with .csv, content has header + body, row_count matches", async () => {
    vi.mocked(prisma.callLog.findMany).mockResolvedValue([
      {
        id: "cl-1",
        started_at: new Date("2026-01-15T10:00:00.000Z"),
        ended_at: new Date("2026-01-15T10:05:30.000Z"),
        call_type: "intercom",
        status: "completed",
        participant_count: 2,
        caller_user_id: "u-1",
        caller_department_id: "d-1",
        recipient_department_id: "d-2",
        meeting_id: null,
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.exportCallLogsCsv(RANGE_INPUT);

    expect(res.filename).toBe("call-logs-2026-01-01-2026-01-31.csv");
    expect(res.row_count).toBe(1);
    const lines = res.content.split("\r\n");
    expect(lines[0]).toContain("started_at");
    expect(lines[0]).toContain("duration_seconds");
    expect(lines[1]).toContain("2026-01-15T10:00:00.000Z");
    expect(lines[1]).toContain("330"); // 5min30s
    expect(lines[1]).toContain("intercom");
  });

  it("exportUsageSummaryCsv: aggregates meetings+recordings into per-day rows sorted by date", async () => {
    vi.mocked(prisma.meeting.findMany).mockResolvedValue([
      {
        started_at: new Date("2026-01-02T10:00:00.000Z"),
        host_user_id: "u-1",
      },
      {
        started_at: new Date("2026-01-02T11:00:00.000Z"),
        host_user_id: "u-1",
      },
      {
        started_at: new Date("2026-01-03T09:00:00.000Z"),
        host_user_id: "u-2",
      },
    ] as never);
    vi.mocked(prisma.recording.findMany).mockResolvedValue([
      {
        created_at: new Date("2026-01-02T10:30:00.000Z"),
        duration_seconds: 600, // 10 min
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.exportUsageSummaryCsv(RANGE_INPUT);

    const lines = res.content.split("\r\n").filter((l) => l.length > 0);
    expect(lines[0]).toBe("date,meetings_count,recording_minutes,active_hosts");
    expect(lines[1]).toBe("2026-01-02,2,10,1"); // 2 meetings, 10min, 1 unique host
    expect(lines[2]).toBe("2026-01-03,1,0,1");
  });

  it("exportDeptActivityCsv: emits a row per department including zero-activity ones", async () => {
    vi.mocked(prisma.department.findMany).mockResolvedValue([
      { id: "d-1", name: "Front Desk" },
      { id: "d-2", name: "Reception" },
    ] as never);
    vi.mocked(prisma.callLog.findMany).mockResolvedValue([
      {
        recipient_department_id: "d-1",
        status: "completed",
        started_at: new Date("2026-01-10T10:00:00.000Z"),
        ended_at: new Date("2026-01-10T10:02:00.000Z"),
      },
      {
        recipient_department_id: "d-1",
        status: "missed",
        started_at: new Date("2026-01-10T10:05:00.000Z"),
        ended_at: null,
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.exportDeptActivityCsv(RANGE_INPUT);

    const lines = res.content.split("\r\n").filter((l) => l.length > 0);
    expect(lines[0]).toBe(
      "department_name,calls_received,calls_completed,completion_rate_percent,avg_duration_seconds",
    );
    expect(lines[1]).toBe("Front Desk,2,1,50,120");
    expect(lines[2]).toBe("Reception,0,0,0,0");
  });

  it("empty data still produces header-only CSV", async () => {
    const caller = createCaller(makeCtx());
    const res = await caller.exportCallLogsCsv(RANGE_INPUT);
    expect(res.row_count).toBe(0);
    expect(res.content.split("\r\n")[0]).toContain("started_at");
    expect(res.content.endsWith("\r\n")).toBe(true);
  });
});

// ============================================================================
// PDF output shape — only assert binary-format invariants; pdf.test.ts owns
// the deeper layout checks. Here we confirm the router glue is intact.
// ============================================================================

describe("reports PDF output", () => {
  it("exportCallLogsPdf: filename ends with .pdf, contentBase64 decodes to %PDF-", async () => {
    vi.mocked(prisma.callLog.findMany).mockResolvedValue([
      {
        id: "cl-1",
        started_at: new Date("2026-01-15T10:00:00.000Z"),
        ended_at: new Date("2026-01-15T10:05:30.000Z"),
        call_type: "intercom",
        status: "completed",
        participant_count: 2,
        caller_user_id: "u-1",
        caller_department_id: "d-1",
        recipient_department_id: "d-2",
        meeting_id: null,
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.exportCallLogsPdf(RANGE_INPUT);

    expect(res.filename).toBe("call-logs-2026-01-01-2026-01-31.pdf");
    expect(res.contentBase64.slice(0, 6)).toBe(PDF_MAGIC_B64);
    expect(res.row_count).toBe(1);
  });

  it("exportUsageSummaryPdf: looks up org name for the header", async () => {
    const caller = createCaller(makeCtx());
    await caller.exportUsageSummaryPdf(RANGE_INPUT);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: ORG_A },
      select: { name: true },
    });
  });

  it("exportDeptActivityPdf: NOT_FOUND when org disappears mid-flight", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null as never);
    const caller = createCaller(makeCtx());
    await expect(caller.exportDeptActivityPdf(RANGE_INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
