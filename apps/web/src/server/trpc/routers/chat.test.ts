import { prisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimiters } from "@/server/lib/rate-limit";
import { chatRouter } from "@/server/trpc/routers/chat";
import { createCallerFactory } from "@/server/trpc/trpc";

vi.mock("@yelli/db", () => ({
  prisma: {
    meeting: {
      findUnique: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
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

vi.mock("@/server/lib/sanitize", () => ({
  sanitizePlainText: vi.fn((s: string) => `[clean] ${s}`),
}));

vi.mock("@/server/socket/channels", () => ({
  emitToOrg: vi.fn(),
}));

vi.mock("@/server/socket/server", () => ({
  getIO: vi.fn(),
}));

const createCaller = createCallerFactory(chatRouter);

const SESSION_USER = {
  id: "clgb84nz40000uhcggwxf9eri",
  email: "sender@example.com",
  name: "Sender User",
  displayName: "Sender User",
  organizationId: "org-tenant-cuid",
  organizationSlug: "tenant-org",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

function makeCtx() {
  return {
    session: { user: SESSION_USER, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc/chat.send", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const VALID_MEETING_ID = "clgb84nz40001uhcggwxf9eri";

const PERSISTED_MESSAGE = {
  id: "clgb84nz40002uhcggwxf9eri",
  content: "[clean] hello world",
  message_type: "text" as const,
  file_url: null,
  sender_guest_name: null,
  created_at: new Date("2026-05-25T22:00:00.000Z"),
  sender: {
    id: SESSION_USER.id,
    display_name: "Sender User",
    email: "sender@example.com",
  },
};

describe("chatRouter.send", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(rateLimiters.api.check).mockImplementation(() => {});

    vi.mocked(prisma.meeting.findUnique).mockImplementation((async () => ({
      id: VALID_MEETING_ID,
      status: "in_progress",
    })) as never);
    vi.mocked(prisma.chatMessage.create).mockImplementation((async () =>
      PERSISTED_MESSAGE) as never);

    const { getIO } = await import("@/server/socket/server");
    vi.mocked(getIO).mockReturnValue({
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as unknown as ReturnType<typeof getIO>);
  });

  it("happy path: persists then emits chat:message with {meetingId, message} payload", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");
    const { CHAT_MESSAGE_EVENT } = await import("@/server/socket/chat");

    const caller = createCaller(makeCtx());
    const res = await caller.send({
      meetingId: VALID_MEETING_ID,
      content: "hello world",
      messageType: "text",
    });

    expect(res).toMatchObject({ id: PERSISTED_MESSAGE.id });

    expect(emitToOrg).toHaveBeenCalledTimes(1);
    const [, orgId, eventType, payload] = vi.mocked(emitToOrg).mock.calls[0]!;
    expect(orgId).toBe(SESSION_USER.organizationId);
    expect(eventType).toBe(CHAT_MESSAGE_EVENT);
    expect(payload).toEqual({
      meetingId: VALID_MEETING_ID,
      message: PERSISTED_MESSAGE,
    });
  });

  it("sanitizes content before persist — broadcast carries the sanitized value", async () => {
    const { sanitizePlainText } = await import("@/server/lib/sanitize");
    const { emitToOrg } = await import("@/server/socket/channels");

    const caller = createCaller(makeCtx());
    await caller.send({
      meetingId: VALID_MEETING_ID,
      content: "<script>alert(1)</script>",
      messageType: "text",
    });

    expect(sanitizePlainText).toHaveBeenCalledWith("<script>alert(1)</script>");
    // create() received the cleaned content
    const createArgs = vi.mocked(prisma.chatMessage.create).mock.calls[0]![0];
    expect(createArgs.data).toMatchObject({
      content: "[clean] <script>alert(1)</script>",
    });
    // emit() received the persisted message (already-sanitized content)
    const [, , , payload] = vi.mocked(emitToOrg).mock.calls[0]!;
    expect((payload as { message: { content: string } }).message.content).toBe(
      "[clean] hello world",
    );
  });

  it("file message without fileUrl → BAD_REQUEST, no persist, no emit", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");

    const caller = createCaller(makeCtx());
    await expect(
      caller.send({
        meetingId: VALID_MEETING_ID,
        content: "untitled.pdf",
        messageType: "file",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("meeting not found → NOT_FOUND, no persist, no emit", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.send({
        meetingId: VALID_MEETING_ID,
        content: "hello",
        messageType: "text",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("meeting status=cancelled → FORBIDDEN, no persist, no emit", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");
    vi.mocked(prisma.meeting.findUnique).mockImplementation((async () => ({
      id: VALID_MEETING_ID,
      status: "cancelled",
    })) as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.send({
        meetingId: VALID_MEETING_ID,
        content: "hello",
        messageType: "text",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("meeting status=ended → FORBIDDEN, no persist, no emit", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");
    vi.mocked(prisma.meeting.findUnique).mockImplementation((async () => ({
      id: VALID_MEETING_ID,
      status: "ended",
    })) as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.send({
        meetingId: VALID_MEETING_ID,
        content: "hello",
        messageType: "text",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("getIO() returns null → returns persisted message, no emit (graceful degradation)", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");
    const { getIO } = await import("@/server/socket/server");
    vi.mocked(getIO).mockReturnValue(null);

    const caller = createCaller(makeCtx());
    const res = await caller.send({
      meetingId: VALID_MEETING_ID,
      content: "hello world",
      messageType: "text",
    });

    expect(res).toMatchObject({ id: PERSISTED_MESSAGE.id });
    expect(emitToOrg).not.toHaveBeenCalled();
  });
});

describe("chatRouter.listByMeeting", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(rateLimiters.api.check).mockImplementation(() => {});

    vi.mocked(prisma.meeting.findUnique).mockImplementation((async () => ({
      id: VALID_MEETING_ID,
    })) as never);
    vi.mocked(prisma.chatMessage.findMany).mockImplementation((async () =>
      []) as never);

    const { getIO } = await import("@/server/socket/server");
    vi.mocked(getIO).mockReturnValue({
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as unknown as ReturnType<typeof getIO>);
  });

  it("does not emit chat:message (query path is read-only)", async () => {
    const { emitToOrg } = await import("@/server/socket/channels");

    const caller = createCaller(makeCtx());
    await caller.listByMeeting({ meetingId: VALID_MEETING_ID });

    expect(emitToOrg).not.toHaveBeenCalled();
  });
});
