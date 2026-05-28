import { TRPCError } from "@trpc/server";
import { prisma, writeAuditLog } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requirePlanCapability } from "@/server/trpc/middleware/plan-limit";
import { whiteboardSnapshotsRouter } from "@/server/trpc/routers/whiteboardSnapshots";
import { createCallerFactory } from "@/server/trpc/trpc";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@yelli/db", () => ({
  prisma: {
    meeting: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    whiteboardSnapshot: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    api: { check: vi.fn() },
    auth: { check: vi.fn() },
    public: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

// Mock requirePlanCapability as a passthrough by default.
// Individual tests override this to simulate plan-tier rejection.
vi.mock("@/server/trpc/middleware/plan-limit", () => ({
  requirePlanCapability: vi.fn(
    (_feature: string) =>
      async ({ next }: { next: () => Promise<unknown> }) =>
        next(),
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = "clgb84nz40000uhcggwxorgz";
const MEETING_ID = "clgb84nz40001uhcggwxf9er";
const SNAP_ID = "clgb84nz40002uhcggwxsnap";

const SESSION_USER = {
  displayName: "Host User",
  email: "host@example.com",
  id: "clgb84nz40000uhcggwxf9eri",
  isSuperAdmin: false,
  name: "Host User",
  organizationId: ORG_ID,
  organizationSlug: "tenant-org",
  role: "tenant_admin" as const,
  securityVersion: 1,
};

function makeCtx(overrides?: Partial<typeof SESSION_USER>) {
  const user = { ...SESSION_USER, ...overrides };
  return {
    req: new Request(
      "http://localhost/api/trpc/whiteboardSnapshots.save",
      {
        headers: { "x-forwarded-for": "127.0.0.1" },
        method: "POST",
      },
    ),
    session: { expires: "2099-01-01", user },
  };
}

const SNAPSHOT_ROW = {
  created_at: new Date("2026-05-29T01:00:00Z"),
  id: SNAP_ID,
  is_persisted: true,
  meeting_id: MEETING_ID,
  organization_id: ORG_ID,
  snapshot_data: { strokes: [{ x: 1, y: 2 }] },
};

// ---------------------------------------------------------------------------
// Caller
// ---------------------------------------------------------------------------

const createCaller = createCallerFactory(whiteboardSnapshotsRouter);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("whiteboardSnapshotsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── save ──────────────────────────────────────────────────────────────────

  describe("save", () => {
    it("returns camelCase snapshot shape on success", async () => {
      vi.mocked(prisma.meeting.findFirst).mockResolvedValueOnce(
        { id: MEETING_ID } as Awaited<
          ReturnType<typeof prisma.meeting.findFirst>
        >,
      );
      vi.mocked(prisma.whiteboardSnapshot.create).mockResolvedValueOnce(
        SNAPSHOT_ROW as Awaited<
          ReturnType<typeof prisma.whiteboardSnapshot.create>
        >,
      );

      const caller = createCaller(makeCtx());
      const result = await caller.save({
        meetingId: MEETING_ID,
        snapshotData: { strokes: [{ x: 1, y: 2 }] },
      });

      // Shape assertions — camelCase only
      expect(result).toEqual({
        createdAt: new Date("2026-05-29T01:00:00Z"),
        isPersisted: true,
        meetingId: MEETING_ID,
        snapshotId: SNAP_ID,
      });

      // No snake_case keys
      expect(Object.keys(result)).not.toContain("meeting_id");
      expect(Object.keys(result)).not.toContain("is_persisted");
      expect(Object.keys(result)).not.toContain("created_at");

      // Audit log called once with correct shape
      expect(vi.mocked(writeAuditLog)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: "CREATE",
          entity: "WhiteboardSnapshot",
          entityId: SNAP_ID,
        }),
      );
    });

    it("rejects with FORBIDDEN when plan capability denied", async () => {
      vi.mocked(requirePlanCapability).mockImplementationOnce(
        (_feature: string) =>
          async (_opts: { next: () => Promise<unknown> }) => {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "plan-rejected",
            });
          },
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.save({
          meetingId: MEETING_ID,
          snapshotData: {},
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(vi.mocked(prisma.whiteboardSnapshot.create)).not.toHaveBeenCalled();
    });

    it("rejects with NOT_FOUND when meeting belongs to another org", async () => {
      vi.mocked(prisma.meeting.findFirst).mockResolvedValueOnce(null);

      const caller = createCaller(makeCtx());
      await expect(
        caller.save({
          meetingId: "clother00000000000000f9er",
          snapshotData: {},
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(vi.mocked(prisma.whiteboardSnapshot.create)).not.toHaveBeenCalled();
    });
  });

  // ── getLatest ─────────────────────────────────────────────────────────────

  describe("getLatest", () => {
    it("returns camelCase snapshot shape and queries with correct args", async () => {
      const row = {
        ...SNAPSHOT_ROW,
        created_at: new Date("2026-05-29T02:00:00Z"),
        id: "clgb84nz40009uhcggwxsna9",
        snapshot_data: { strokes: [] },
      };

      vi.mocked(prisma.whiteboardSnapshot.findFirst).mockResolvedValueOnce(
        row as Awaited<
          ReturnType<typeof prisma.whiteboardSnapshot.findFirst>
        >,
      );

      const caller = createCaller(makeCtx());
      const result = await caller.getLatest({ meetingId: MEETING_ID });

      // Shape assertions — camelCase only
      expect(result).toEqual({
        createdAt: new Date("2026-05-29T02:00:00Z"),
        isPersisted: true,
        meetingId: MEETING_ID,
        snapshotData: { strokes: [] },
        snapshotId: "clgb84nz40009uhcggwxsna9",
      });

      // No snake_case keys
      expect(result).not.toBeNull();
      if (result === null) throw new Error("unreachable");
      const keys = Object.keys(result);
      expect(keys).not.toContain("meeting_id");
      expect(keys).not.toContain("snapshot_data");
      expect(keys).not.toContain("is_persisted");
      expect(keys).not.toContain("created_at");

      // Query args: correct where + orderBy
      expect(vi.mocked(prisma.whiteboardSnapshot.findFirst)).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: "desc" },
          where: {
            meeting_id: MEETING_ID,
            organization_id: ORG_ID,
          },
        }),
      );
    });

    it("returns null when no snapshot exists for the meeting", async () => {
      vi.mocked(prisma.whiteboardSnapshot.findFirst).mockResolvedValueOnce(null);

      const caller = createCaller(makeCtx());
      const result = await caller.getLatest({ meetingId: MEETING_ID });

      expect(result).toBeNull();
    });

    it("rejects with FORBIDDEN when plan capability denied", async () => {
      vi.mocked(requirePlanCapability).mockImplementationOnce(
        (_feature: string) =>
          async (_opts: { next: () => Promise<unknown> }) => {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "plan-rejected",
            });
          },
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.getLatest({ meetingId: MEETING_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(vi.mocked(prisma.whiteboardSnapshot.findFirst)).not.toHaveBeenCalled();
    });
  });
});
