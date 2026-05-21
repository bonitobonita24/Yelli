/**
 * (guest-meeting-livekit-peer-disconnect): RED→GREEN tests for the pure
 * disconnect-reason diagnostic helper. The helper maps each LiveKit
 * `DisconnectReason` enum value to (a) a human-readable label, (b) one
 * of three pre-ranked hypotheses from the ticket investigation, and
 * (c) a short diagnostic description.
 *
 * Why a pure helper: the consuming `useMeetingRoom` hook lives in a
 * client-only module hard to unit-test under vitest's `environment: "node"`
 * config. The mapping logic is the part worth locking in tests — the
 * hook just calls this and console.warns the result.
 */

import { DisconnectReason } from "livekit-client";
import { describe, expect, it } from "vitest";

import { describeDisconnectReason } from "./disconnect-reason";

describe("describeDisconnectReason — hypothesis mapping", () => {
  it("CLIENT_INITIATED maps to client-cleanup with explicit dual-meaning disambiguation", () => {
    const diagnosis = describeDisconnectReason(
      DisconnectReason.CLIENT_INITIATED,
    );
    expect(diagnosis.label).toBe("CLIENT_INITIATED");
    expect(diagnosis.hypothesis).toBe("client-cleanup");
    // Description must surface the ambiguity: CLIENT_INITIATED fires for BOTH
    // explicit cleanup AND LiveKit's internal abort on connect failure.
    // Discovered via (guest-meeting-loader-memo-stability) smoke 2026-05-21:
    // empty roomID/participantID in the preceding LiveKit log proves the room
    // was never fully connected → transport/ICE failure surfacing as CLIENT_INITIATED.
    expect(diagnosis.description).toMatch(/AMBIGUOUS/);
    expect(diagnosis.description).toMatch(/connect\(\) fails|ICE|transport/i);
    expect(diagnosis.description).toMatch(/cleanup|hangup|unstable refs/i);
    expect(diagnosis.description).toMatch(/roomID|participantID/i);
    // (disconnect-reason-description-refine) 2026-05-21: surface the SECOND
    // signal-connecting heuristic from yesterday's (disconnect-reason-dual-meaning)
    // investigation. When CLIENT_INITIATED is the failed-connect() variant, the
    // LiveKit client retries internally before aborting — TWO "Signal connecting"
    // log lines appear in the console preceding the disconnect. A single
    // "Signal connecting" line means real cleanup. Faster to spot than empty
    // roomID/participantID and works even when the abort log is truncated.
    expect(diagnosis.description).toMatch(/SECOND.*[Ss]ignal.*[Cc]onnecting/);
  });

  it("DUPLICATE_IDENTITY maps to hypothesis (b) — StrictMode double-mount", () => {
    const diagnosis = describeDisconnectReason(
      DisconnectReason.DUPLICATE_IDENTITY,
    );
    expect(diagnosis.label).toBe("DUPLICATE_IDENTITY");
    expect(diagnosis.hypothesis).toBe("duplicate-identity");
    expect(diagnosis.description).toMatch(/identity|strict.*mode|double/i);
  });

  it("CONNECTION_TIMEOUT maps to hypothesis (a) — transport/ICE failure", () => {
    const diagnosis = describeDisconnectReason(
      DisconnectReason.CONNECTION_TIMEOUT,
    );
    expect(diagnosis.label).toBe("CONNECTION_TIMEOUT");
    expect(diagnosis.hypothesis).toBe("transport-failure");
    expect(diagnosis.description).toMatch(/ice|turn|coturn|transport/i);
  });

  it("SIGNAL_CLOSE maps to transport-failure (signaling WS dropped)", () => {
    const diagnosis = describeDisconnectReason(DisconnectReason.SIGNAL_CLOSE);
    expect(diagnosis.label).toBe("SIGNAL_CLOSE");
    expect(diagnosis.hypothesis).toBe("transport-failure");
  });

  it("JOIN_FAILURE maps to transport-failure (never fully connected)", () => {
    const diagnosis = describeDisconnectReason(DisconnectReason.JOIN_FAILURE);
    expect(diagnosis.label).toBe("JOIN_FAILURE");
    expect(diagnosis.hypothesis).toBe("transport-failure");
  });

  it("MEDIA_FAILURE maps to media-failure", () => {
    const diagnosis = describeDisconnectReason(DisconnectReason.MEDIA_FAILURE);
    expect(diagnosis.label).toBe("MEDIA_FAILURE");
    expect(diagnosis.hypothesis).toBe("media-failure");
  });

  it("SERVER_SHUTDOWN / ROOM_DELETED / PARTICIPANT_REMOVED map to server-initiated", () => {
    expect(
      describeDisconnectReason(DisconnectReason.SERVER_SHUTDOWN).hypothesis,
    ).toBe("server-initiated");
    expect(
      describeDisconnectReason(DisconnectReason.ROOM_DELETED).hypothesis,
    ).toBe("server-initiated");
    expect(
      describeDisconnectReason(DisconnectReason.PARTICIPANT_REMOVED).hypothesis,
    ).toBe("server-initiated");
  });

  it("UNKNOWN_REASON and undefined both map to unknown hypothesis", () => {
    expect(
      describeDisconnectReason(DisconnectReason.UNKNOWN_REASON).hypothesis,
    ).toBe("unknown");
    expect(describeDisconnectReason(undefined).hypothesis).toBe("unknown");
    expect(describeDisconnectReason(undefined).label).toBe("UNKNOWN_REASON");
  });

  it("every diagnosis carries a non-empty description string", () => {
    const reasons: Array<DisconnectReason | undefined> = [
      undefined,
      DisconnectReason.UNKNOWN_REASON,
      DisconnectReason.CLIENT_INITIATED,
      DisconnectReason.DUPLICATE_IDENTITY,
      DisconnectReason.SERVER_SHUTDOWN,
      DisconnectReason.PARTICIPANT_REMOVED,
      DisconnectReason.ROOM_DELETED,
      DisconnectReason.STATE_MISMATCH,
      DisconnectReason.JOIN_FAILURE,
      DisconnectReason.MIGRATION,
      DisconnectReason.SIGNAL_CLOSE,
      DisconnectReason.ROOM_CLOSED,
      DisconnectReason.USER_UNAVAILABLE,
      DisconnectReason.USER_REJECTED,
      DisconnectReason.SIP_TRUNK_FAILURE,
      DisconnectReason.CONNECTION_TIMEOUT,
      DisconnectReason.MEDIA_FAILURE,
      DisconnectReason.AGENT_ERROR,
    ];
    for (const r of reasons) {
      const d = describeDisconnectReason(r);
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.label.length).toBeGreaterThan(0);
    }
  });
});
