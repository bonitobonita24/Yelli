import { TRPCError } from "@trpc/server";
import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sharedFilesRouter } from "@/server/trpc/routers/sharedFiles";
import { createCallerFactory } from "@/server/trpc/trpc";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@yelli/db", () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    sharedFile: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  writeAuditLog: vi.fn(),
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@yelli/storage", () => ({
  buildStorageKey: vi.fn(
    (org: string, ent: string, ext: string) =>
      `${org}/${ent}/random-cuid.${ext}`,
  ),
  getPresignedUploadUrl: vi.fn(async () => ({
    url: "https://minio.example.com/presigned-put",
    expiresAt: "2026-05-29T10:15:00.000Z",
  })),
  getDownloadUrl: vi.fn(),
  verifyKeyOwnership: vi.fn(() => true),
}));

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    auth: { check: vi.fn() },
    api: { check: vi.fn() },
    public: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

// Mock requirePlanCapability as a passthrough by default.
// Individual tests override this to simulate free-tier rejection.
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
const OTHER_ORG_ID = "clother00000000000000orgz";
const MEETING_ID = "clgb84nz40001uhcggwxf9er";
const FILE_ID = "clgb84nz40002uhcggwxf1le";
const STORAGE_KEY = `${ORG_ID}/shared-file/random-cuid.pdf`;

const SESSION_USER = {
  id: "clgb84nz40000uhcggwxf9eri",
  email: "host@example.com",
  name: "Host User",
  displayName: "Host User",
  organizationId: ORG_ID,
  organizationSlug: "tenant-org",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

function makeCtx(overrides?: Partial<typeof SESSION_USER>) {
  const user = { ...SESSION_USER, ...overrides };
  return {
    session: { user, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/sharedFiles.requestUpload", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const SHARED_FILE_ROW = {
  id: FILE_ID,
  organization_id: ORG_ID,
  meeting_id: MEETING_ID,
  uploaded_by_user_id: SESSION_USER.id,
  uploaded_by_guest_name: null,
  file_name: "report.pdf",
  file_path: STORAGE_KEY,
  file_size_bytes: BigInt(102400),
  mime_type: "application/pdf",
  is_persisted: true,
  created_at: new Date("2026-05-29T10:00:00Z"),
  expires_at: new Date("2026-06-28T10:00:00Z"),
  deleted_at: null,
};

/** Soft-deleted row: deleted_at set to a concrete timestamp */
const DELETED_FILE_ROW = {
  ...SHARED_FILE_ROW,
  deleted_at: new Date("2026-05-29T10:30:00Z"),
};

const createCaller = createCallerFactory(sharedFilesRouter);

// ---------------------------------------------------------------------------
// Helper: simulate free-tier plan rejection
// ---------------------------------------------------------------------------

async function expectPlanRejection(fn: () => Promise<unknown>) {
  const { requirePlanCapability } = await import(
    "@/server/trpc/middleware/plan-limit"
  );
  vi.mocked(requirePlanCapability).mockReturnValueOnce(
    async ({ next: _next }: { next: () => Promise<unknown> }) => {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Feature 'filePersistence' requires a higher plan.",
      });
    },
  );
  await expect(fn()).rejects.toMatchObject({ code: "FORBIDDEN" });
}

// ---------------------------------------------------------------------------
// requestUpload
// ---------------------------------------------------------------------------

describe("sharedFilesRouter.requestUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: env var present
    process.env.STORAGE_BUCKET = "yelli-dev";
  });

  it("happy path: returns presigned uploadUrl and storageKey", async () => {
    const { buildStorageKey } = await import("@yelli/storage");
    const caller = createCaller(makeCtx());
    const res = await caller.requestUpload({
      meetingId: MEETING_ID,
      filename: "report.pdf",
      sizeBytes: 102400,
      mimeType: "application/pdf",
    });

    expect(buildStorageKey).toHaveBeenCalledWith(ORG_ID, "shared-file", "pdf");
    expect(res.uploadUrl).toBe("https://minio.example.com/presigned-put");
    expect(res.storageKey).toMatch(new RegExp(`^${ORG_ID}/shared-file/`));
  });

  it("plan-capability rejection for free tier", async () => {
    const caller = createCaller(makeCtx());
    await expectPlanRejection(() =>
      caller.requestUpload({
        meetingId: MEETING_ID,
        filename: "report.pdf",
        sizeBytes: 102400,
        mimeType: "application/pdf",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// commit
// ---------------------------------------------------------------------------

describe("sharedFilesRouter.commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.sharedFile.create).mockResolvedValue(
      SHARED_FILE_ROW as never,
    );
  });

  it("happy path: creates SharedFile row and returns camelCase shape", async () => {
    const caller = createCaller(makeCtx());
    const res = await caller.commit({
      meetingId: MEETING_ID,
      storageKey: STORAGE_KEY,
      filename: "report.pdf",
      sizeBytes: 102400,
      mimeType: "application/pdf",
    });

    expect(prisma.sharedFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: ORG_ID,
          meeting_id: MEETING_ID,
          is_persisted: true,
          file_name: "report.pdf",
        }),
      }),
    );

    // Verify camelCase response shape (lessons.md 🔴 fixture/response-shape gotcha)
    expect(res).toEqual(
      expect.objectContaining({
        fileId: FILE_ID,
        meetingId: MEETING_ID,
        filename: "report.pdf",
        sizeBytes: 102400,
        mimeType: "application/pdf",
        isPersisted: true,
      }),
    );
    // Verify no snake_case leakage
    expect(res).not.toHaveProperty("file_name");
    expect(res).not.toHaveProperty("organization_id");
    expect(res).not.toHaveProperty("file_size_bytes");
  });

  it("NOT_FOUND when storage key belongs to a different org (cross-org ownership)", async () => {
    const { verifyKeyOwnership } = await import("@yelli/storage");
    vi.mocked(verifyKeyOwnership).mockReturnValueOnce(false);

    const caller = createCaller(makeCtx());
    await expect(
      caller.commit({
        meetingId: MEETING_ID,
        storageKey: `${OTHER_ORG_ID}/shared-file/random-cuid.pdf`,
        filename: "report.pdf",
        sizeBytes: 102400,
        mimeType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Ensure DB write did NOT happen
    expect(prisma.sharedFile.create).not.toHaveBeenCalled();
  });

  it("plan-capability rejection for free tier", async () => {
    const caller = createCaller(makeCtx());
    await expectPlanRejection(() =>
      caller.commit({
        meetingId: MEETING_ID,
        storageKey: STORAGE_KEY,
        filename: "report.pdf",
        sizeBytes: 102400,
        mimeType: "application/pdf",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// listByMeeting
// ---------------------------------------------------------------------------

describe("sharedFilesRouter.listByMeeting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns camelCase file list for the meeting", async () => {
    vi.mocked(prisma.sharedFile.findMany).mockResolvedValue([
      SHARED_FILE_ROW,
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.listByMeeting({ meetingId: MEETING_ID });

    expect(prisma.sharedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: ORG_ID,
          meeting_id: MEETING_ID,
          // Soft-deleted rows excluded via deleted_at: null filter
          deleted_at: null,
          OR: expect.arrayContaining([
            { expires_at: null },
            expect.objectContaining({ expires_at: expect.objectContaining({ gt: expect.any(Date) }) }),
          ]),
        }),
      }),
    );

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      fileId: FILE_ID,
      meetingId: MEETING_ID,
      filename: "report.pdf",
      sizeBytes: 102400,
      mimeType: "application/pdf",
    });
    // No snake_case leakage
    expect(res[0]).not.toHaveProperty("organization_id");
  });

  it("only returns same-org files (batch ownership / L6 scope)", async () => {
    const sameOrgFile = { ...SHARED_FILE_ROW };
    // L6 + explicit org filter: only same-org rows reach findMany.
    // Simulate: findMany returns only the same-org row.
    vi.mocked(prisma.sharedFile.findMany).mockResolvedValue([
      sameOrgFile,
    ] as never);

    const caller = createCaller(makeCtx());
    const res = await caller.listByMeeting({ meetingId: MEETING_ID });

    // Confirm org filter was included in the query
    expect(prisma.sharedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: ORG_ID }),
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0]?.fileId).toBe(FILE_ID);
  });

  it("returns empty array when no files for meeting", async () => {
    vi.mocked(prisma.sharedFile.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    const res = await caller.listByMeeting({ meetingId: MEETING_ID });
    expect(res).toEqual([]);
  });

  it("plan-capability rejection for free tier", async () => {
    const caller = createCaller(makeCtx());
    await expectPlanRejection(() =>
      caller.listByMeeting({ meetingId: MEETING_ID }),
    );
  });
});

// ---------------------------------------------------------------------------
// getDownloadUrl
// ---------------------------------------------------------------------------

describe("sharedFilesRouter.getDownloadUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.sharedFile.findUnique).mockResolvedValue(
      SHARED_FILE_ROW as never,
    );
  });

  it("happy path: returns signed download url and filename", async () => {
    const { getDownloadUrl } = await import("@yelli/storage");
    vi.mocked(getDownloadUrl).mockResolvedValueOnce({
      url: "https://minio.example.com/presigned-get",
      expiresAt: "2026-05-29T11:00:00.000Z",
    });

    const caller = createCaller(makeCtx());
    const res = await caller.getDownloadUrl({ fileId: FILE_ID });

    expect(res).toEqual({
      url: "https://minio.example.com/presigned-get",
      expiresAt: "2026-05-29T11:00:00.000Z",
      filename: "report.pdf",
    });
  });

  it("NOT_FOUND when file does not exist", async () => {
    vi.mocked(prisma.sharedFile.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.getDownloadUrl({ fileId: FILE_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("NOT_FOUND when file is soft-deleted (deleted_at is set)", async () => {
    vi.mocked(prisma.sharedFile.findUnique).mockResolvedValue(
      DELETED_FILE_ROW as never,
    );

    const caller = createCaller(makeCtx());
    await expect(
      caller.getDownloadUrl({ fileId: FILE_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("NOT_FOUND (not FORBIDDEN) when key belongs to different org — enumeration prevention", async () => {
    const { verifyKeyOwnership } = await import("@yelli/storage");
    vi.mocked(verifyKeyOwnership).mockReturnValueOnce(false);

    const caller = createCaller(makeCtx());
    await expect(
      caller.getDownloadUrl({ fileId: FILE_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("plan-capability rejection for free tier", async () => {
    const caller = createCaller(makeCtx());
    await expectPlanRejection(() => caller.getDownloadUrl({ fileId: FILE_ID }));
  });
});

// ---------------------------------------------------------------------------
// softDelete
// ---------------------------------------------------------------------------

describe("sharedFilesRouter.softDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.sharedFile.findUnique).mockResolvedValue(
      SHARED_FILE_ROW as never,
    );
    vi.mocked(prisma.sharedFile.update).mockResolvedValue({
      ...SHARED_FILE_ROW,
      deleted_at: new Date(),
    } as never);
  });

  it("happy path: sets deleted_at and returns { ok: true }", async () => {
    const caller = createCaller(makeCtx());
    const res = await caller.softDelete({ fileId: FILE_ID });

    expect(prisma.sharedFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FILE_ID },
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      }),
    );
    expect(res).toEqual({ ok: true });
  });

  it("NOT_FOUND when file does not exist", async () => {
    vi.mocked(prisma.sharedFile.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.softDelete({ fileId: FILE_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.sharedFile.update).not.toHaveBeenCalled();
  });

  it("NOT_FOUND when file is already soft-deleted (deleted_at is set)", async () => {
    vi.mocked(prisma.sharedFile.findUnique).mockResolvedValue(
      DELETED_FILE_ROW as never,
    );

    const caller = createCaller(makeCtx());
    await expect(
      caller.softDelete({ fileId: FILE_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.sharedFile.update).not.toHaveBeenCalled();
  });

  it("NOT_FOUND (not FORBIDDEN) when key belongs to different org — enumeration prevention", async () => {
    const { verifyKeyOwnership } = await import("@yelli/storage");
    vi.mocked(verifyKeyOwnership).mockReturnValueOnce(false);

    const caller = createCaller(makeCtx());
    await expect(
      caller.softDelete({ fileId: FILE_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.sharedFile.update).not.toHaveBeenCalled();
  });

  it("plan-capability rejection for free tier", async () => {
    const caller = createCaller(makeCtx());
    await expectPlanRejection(() => caller.softDelete({ fileId: FILE_ID }));
  });
});
