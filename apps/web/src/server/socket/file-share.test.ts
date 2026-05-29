import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import {
  FILE_SHARE_BROADCAST_EVENT,
  FILE_SHARE_REJECTED_EVENT,
  FILE_SHARE_UPLOAD_EVENT,
  MAX_FREE_TIER_FILE_BYTES,
  attachFileShareHandlers,
} from "./file-share";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

vi.mock("@/server/socket/channels", () => ({
  emitToOrg: vi.fn(),
  joinOrgChannel: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

type UploadListener = (payload: unknown) => void;

interface FakeSocket {
  data: { session?: SocketSession };
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  __emit: (event: typeof FILE_SHARE_UPLOAD_EVENT, payload: unknown) => void;
}

function makeFakeSocket(session?: SocketSession): FakeSocket {
  const uploadListeners = new Set<UploadListener>();
  const on = vi.fn((event: string, listener: UploadListener) => {
    if (event === FILE_SHARE_UPLOAD_EVENT) uploadListeners.add(listener);
  });
  return {
    data: session !== undefined ? { session } : {},
    on,
    emit: vi.fn(),
    __emit: (_event, payload) => {
      for (const listener of uploadListeners) listener(payload);
    },
  };
}

const SAMPLE_SESSION: SocketSession = {
  userId: "user_alice",
  organizationId: "org_acme",
  organizationSlug: "acme",
  role: "host",
  isSuperAdmin: false,
  securityVersion: 1,
};

const fakeIO = {} as IOServer;

function castSocket(fake: FakeSocket): Socket {
  return fake as unknown as Socket;
}

/** Minimal valid PNG payload well under 2 MB. */
const VALID_PNG_PAYLOAD = {
  meetingId: "meeting_123",
  filename: "screenshot.png",
  mimeType: "image/png",
  // ~75 bytes decoded — far below cap
  base64Data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
};

/** base64 string long enough that Math.floor(length * 3 / 4) > 2 MB. */
const OVERSIZE_BASE64 = "A".repeat(2_800_000); // decodes to ~2.1 MB

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("attachFileShareHandlers", () => {
  beforeEach(() => {
    vi.mocked(emitToOrg).mockClear();
    vi.mocked(joinOrgChannel).mockClear();
  });

  // ── 1. attaches ────────────────────────────────────────────────────────────

  it("joins broadcast channel and binds upload listener when session present", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachFileShareHandlers({ io: fakeIO, socket: castSocket(socket) });

    expect(joinOrgChannel).toHaveBeenCalledOnce();
    expect(joinOrgChannel).toHaveBeenCalledWith(
      castSocket(socket),
      FILE_SHARE_BROADCAST_EVENT,
    );
    expect(socket.on).toHaveBeenCalledOnce();
    expect(socket.on).toHaveBeenCalledWith(
      FILE_SHARE_UPLOAD_EVENT,
      expect.any(Function),
    );
  });

  // ── 2. no-op when session undefined ───────────────────────────────────────

  it("is a no-op when socket.data.session is undefined", () => {
    const socket = makeFakeSocket(undefined);
    attachFileShareHandlers({ io: fakeIO, socket: castSocket(socket) });

    expect(joinOrgChannel).not.toHaveBeenCalled();
    expect(socket.on).not.toHaveBeenCalled();
  });

  // ── 3. happy path PNG ─────────────────────────────────────────────────────

  it("broadcasts valid PNG payload to org peers with senderUserId + sentAt", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachFileShareHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(FILE_SHARE_UPLOAD_EVENT, VALID_PNG_PAYLOAD);

    expect(emitToOrg).toHaveBeenCalledOnce();
    const call0 = vi.mocked(emitToOrg).mock.calls[0];
    if (!call0) throw new Error("emitToOrg not called");
    const [calledIO, calledOrgId, calledEvent, calledPayload] = call0;
    expect(calledIO).toBe(fakeIO);
    expect(calledOrgId).toBe("org_acme");
    expect(calledEvent).toBe(FILE_SHARE_BROADCAST_EVENT);
    expect(calledPayload).toMatchObject({
      ...VALID_PNG_PAYLOAD,
      senderUserId: "user_alice",
    });
    expect(typeof (calledPayload as { sentAt: string }).sentAt).toBe("string");
    // Originating socket must NOT receive a rejection
    expect(socket.emit).not.toHaveBeenCalled();
  });

  // ── 4. oversize ───────────────────────────────────────────────────────────

  it("rejects oversize file with too_large reason and does not broadcast", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachFileShareHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(FILE_SHARE_UPLOAD_EVENT, {
      ...VALID_PNG_PAYLOAD,
      base64Data: OVERSIZE_BASE64,
    });

    expect(socket.emit).toHaveBeenCalledOnce();
    expect(socket.emit).toHaveBeenCalledWith(FILE_SHARE_REJECTED_EVENT, {
      reason: "too_large",
      maxBytes: MAX_FREE_TIER_FILE_BYTES,
    });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 5. disallowed MIME ────────────────────────────────────────────────────

  it("rejects disallowed MIME type and does not broadcast", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachFileShareHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(FILE_SHARE_UPLOAD_EVENT, {
      ...VALID_PNG_PAYLOAD,
      mimeType: "application/x-msdownload",
    });

    expect(socket.emit).toHaveBeenCalledOnce();
    expect(socket.emit).toHaveBeenCalledWith(FILE_SHARE_REJECTED_EVENT, {
      reason: "mime_not_allowed",
      mimeType: "application/x-msdownload",
    });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 6. invalid payload — missing meetingId ────────────────────────────────

  it("rejects payload missing meetingId with invalid_payload reason", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachFileShareHandlers({ io: fakeIO, socket: castSocket(socket) });
    const { meetingId: _dropped, ...noMeetingId } = VALID_PNG_PAYLOAD;
    socket.__emit(FILE_SHARE_UPLOAD_EVENT, noMeetingId);

    expect(socket.emit).toHaveBeenCalledOnce();
    expect(socket.emit).toHaveBeenCalledWith(FILE_SHARE_REJECTED_EVENT, {
      reason: "invalid_payload",
    });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 7. invalid payload — empty filename ───────────────────────────────────

  it("rejects payload with empty filename with invalid_payload reason", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachFileShareHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(FILE_SHARE_UPLOAD_EVENT, {
      ...VALID_PNG_PAYLOAD,
      filename: "",
    });

    expect(socket.emit).toHaveBeenCalledOnce();
    expect(socket.emit).toHaveBeenCalledWith(FILE_SHARE_REJECTED_EVENT, {
      reason: "invalid_payload",
    });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  // ── 8. happy path PDF ─────────────────────────────────────────────────────

  it("broadcasts valid PDF payload to org peers", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachFileShareHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit(FILE_SHARE_UPLOAD_EVENT, {
      meetingId: "meeting_456",
      filename: "document.pdf",
      mimeType: "application/pdf",
      base64Data: "JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==",
    });

    expect(emitToOrg).toHaveBeenCalledOnce();
    const call0pdf = vi.mocked(emitToOrg).mock.calls[0];
    if (!call0pdf) throw new Error("emitToOrg not called");
    const [, , calledEvent, calledPayload] = call0pdf;
    expect(calledEvent).toBe(FILE_SHARE_BROADCAST_EVENT);
    expect((calledPayload as { mimeType: string }).mimeType).toBe(
      "application/pdf",
    );
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
