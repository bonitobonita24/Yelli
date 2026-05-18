import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import { attachCallHandlers } from "./calls";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

vi.mock("@/server/socket/channels", () => ({
  emitToOrg: vi.fn(),
  joinOrgChannel: vi.fn(),
}));

type RejectListener = (payload: unknown) => void;

interface FakeSocket {
  data: { session?: SocketSession };
  on: ReturnType<typeof vi.fn>;
  __emit: (event: "call:reject", payload: unknown) => void;
}

function makeFakeSocket(session?: SocketSession): FakeSocket {
  const rejectListeners = new Set<RejectListener>();
  const on = vi.fn((event: string, listener: RejectListener) => {
    if (event === "call:reject") rejectListeners.add(listener);
  });
  return {
    data: session !== undefined ? { session } : {},
    on,
    __emit: (event, payload) => {
      if (event === "call:reject") {
        for (const listener of rejectListeners) listener(payload);
      }
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

describe("attachCallHandlers", () => {
  beforeEach(() => {
    vi.mocked(emitToOrg).mockClear();
    vi.mocked(joinOrgChannel).mockClear();
  });

  it("is a no-op when socket.data.session is undefined", () => {
    const socket = makeFakeSocket(undefined);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    expect(joinOrgChannel).not.toHaveBeenCalled();
    expect(socket.on).not.toHaveBeenCalled();
  });

  it("joins both org channels on connect", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    expect(joinOrgChannel).toHaveBeenCalledWith(socket, "call:incoming");
    expect(joinOrgChannel).toHaveBeenCalledWith(socket, "call:rejected");
    expect(joinOrgChannel).toHaveBeenCalledTimes(2);
  });

  it("relays valid call:reject as call:rejected via emitToOrg", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { callId: "call_abc" });
    expect(emitToOrg).toHaveBeenCalledTimes(1);
    expect(emitToOrg).toHaveBeenCalledWith(
      fakeIO,
      "org_acme",
      "call:rejected",
      { callId: "call_abc", reason: "declined" },
    );
  });

  it("ignores malformed call:reject payload (non-object)", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", "not an object");
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("ignores call:reject with missing callId field", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { reason: "declined" });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("ignores call:reject with non-string callId", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { callId: 12345 });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("ignores call:reject with empty-string callId", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { callId: "" });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("ignores call:reject with callId longer than 128 chars", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { callId: "x".repeat(129) });
    expect(emitToOrg).not.toHaveBeenCalled();
  });
});
