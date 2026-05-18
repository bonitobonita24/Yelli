/**
 * Phase 7 #15 — pure incoming-call event handler.
 *
 * Wires socket.on("call:incoming") and socket.on("call:rejected") to
 * caller-provided callbacks. Returns a disposer that unwires both.
 * Node-testable: takes a minimal socket interface, not React's TypedSocket
 * directly, so we can construct fakes in vitest without jsdom.
 *
 * Follows [[pure-helper-extraction-pattern]] (Phase 7 #11 + #14 precedent).
 */
import type { IncomingCallPayload } from "@/lib/livekit/types";

export interface RejectedPayload {
  callId: string;
  reason: "declined" | "unavailable";
}

export interface MinimalIncomingCallSocketTarget {
  on(event: "call:incoming", listener: (payload: IncomingCallPayload) => void): unknown;
  on(event: "call:rejected", listener: (payload: RejectedPayload) => void): unknown;
  off(event: "call:incoming", listener: (payload: IncomingCallPayload) => void): unknown;
  off(event: "call:rejected", listener: (payload: RejectedPayload) => void): unknown;
}

export interface IncomingCallCallbacks {
  onIncoming: (payload: IncomingCallPayload) => void;
  onRejected: (payload: RejectedPayload) => void;
}

export type IncomingCallDisposer = () => void;

export function attachIncomingCallHandler(
  socket: MinimalIncomingCallSocketTarget,
  callbacks: IncomingCallCallbacks,
): IncomingCallDisposer {
  const { onIncoming, onRejected } = callbacks;
  socket.on("call:incoming", onIncoming);
  socket.on("call:rejected", onRejected);
  return () => {
    socket.off("call:incoming", onIncoming);
    socket.off("call:rejected", onRejected);
  };
}
