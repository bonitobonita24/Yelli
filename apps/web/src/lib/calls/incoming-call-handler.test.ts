import { describe, expect, it, vi } from "vitest";

import { attachIncomingCallHandler } from "./incoming-call-handler";

import type {
  MinimalIncomingCallSocketTarget,
  RejectedPayload,
} from "./incoming-call-handler";
import type { IncomingCallPayload } from "@/lib/livekit/types";

type IncomingListener = (payload: IncomingCallPayload) => void;
type RejectedListener = (payload: RejectedPayload) => void;

interface FakeSocket {
  socket: MinimalIncomingCallSocketTarget;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  __emit: (event: "call:incoming" | "call:rejected", payload: unknown) => void;
}

function makeFakeSocket(): FakeSocket {
  const incoming = new Set<IncomingListener>();
  const rejected = new Set<RejectedListener>();
  const on = vi.fn((event: string, listener: unknown) => {
    if (event === "call:incoming") incoming.add(listener as IncomingListener);
    if (event === "call:rejected") rejected.add(listener as RejectedListener);
  });
  const off = vi.fn((event: string, listener: unknown) => {
    if (event === "call:incoming") incoming.delete(listener as IncomingListener);
    if (event === "call:rejected") rejected.delete(listener as RejectedListener);
  });
  const loose = { on, off };
  return {
    socket: loose as unknown as MinimalIncomingCallSocketTarget,
    on,
    off,
    __emit: (event, payload) => {
      if (event === "call:incoming") {
        for (const listener of incoming) listener(payload as IncomingCallPayload);
      } else {
        for (const listener of rejected) listener(payload as RejectedPayload);
      }
    },
  };
}

const SAMPLE_INCOMING: IncomingCallPayload = {
  callId: "call_abc",
  callerName: "Alice",
  callerDepartment: null,
  roomName: "room_xyz",
  recipientDeptId: "dept_1",
};

describe("attachIncomingCallHandler", () => {
  it("registers both call:incoming and call:rejected listeners on the socket", () => {
    const fake = makeFakeSocket();
    attachIncomingCallHandler(fake.socket, {
      onIncoming: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(fake.on).toHaveBeenCalledWith("call:incoming", expect.any(Function));
    expect(fake.on).toHaveBeenCalledWith("call:rejected", expect.any(Function));
    expect(fake.on).toHaveBeenCalledTimes(2);
  });

  it("invokes onIncoming with the payload when the socket emits call:incoming", () => {
    const fake = makeFakeSocket();
    const onIncoming = vi.fn();
    attachIncomingCallHandler(fake.socket, { onIncoming, onRejected: vi.fn() });
    fake.__emit("call:incoming", SAMPLE_INCOMING);
    expect(onIncoming).toHaveBeenCalledTimes(1);
    expect(onIncoming).toHaveBeenCalledWith(SAMPLE_INCOMING);
  });

  it("invokes onRejected with {callId, reason} when the socket emits call:rejected", () => {
    const fake = makeFakeSocket();
    const onRejected = vi.fn();
    attachIncomingCallHandler(fake.socket, { onIncoming: vi.fn(), onRejected });
    fake.__emit("call:rejected", { callId: "call_abc", reason: "declined" });
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected).toHaveBeenCalledWith({ callId: "call_abc", reason: "declined" });
  });

  it("disposer unwires both listeners (no further callbacks after dispose)", () => {
    const fake = makeFakeSocket();
    const onIncoming = vi.fn();
    const onRejected = vi.fn();
    const dispose = attachIncomingCallHandler(fake.socket, { onIncoming, onRejected });
    dispose();
    expect(fake.off).toHaveBeenCalledWith("call:incoming", expect.any(Function));
    expect(fake.off).toHaveBeenCalledWith("call:rejected", expect.any(Function));
    fake.__emit("call:incoming", SAMPLE_INCOMING);
    fake.__emit("call:rejected", { callId: "call_abc", reason: "declined" });
    expect(onIncoming).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('invokes onRejected with reason: "unavailable" when emitted with that union member', () => {
    const fake = makeFakeSocket();
    const onRejected = vi.fn();
    attachIncomingCallHandler(fake.socket, { onIncoming: vi.fn(), onRejected });
    fake.__emit("call:rejected", { callId: "call_abc", reason: "unavailable" });
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected).toHaveBeenCalledWith({ callId: "call_abc", reason: "unavailable" });
  });
});
