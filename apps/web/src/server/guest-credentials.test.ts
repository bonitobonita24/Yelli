/**
 * (guest-meeting-page-render) — sessionStorage credential parser tests.
 *
 * The Client-Component loader reads the raw string from
 * `sessionStorage["yelli:guest-meeting:{meetingId}"]` and passes it
 * through this pure parser before handing the result to LiveKit.
 *
 * Validation rules:
 *   - raw must be a non-empty JSON string
 *   - parsed shape must have all 4 required string fields (non-empty):
 *       livekitJwt, wsUrl, roomName, displayName
 *   - any malformed input returns null (loader treats null as "no credentials,
 *     redirect to /join")
 */
import { describe, expect, it } from "vitest";

import { parseGuestMeetingCredentials } from "@/server/guest-credentials";

const VALID = JSON.stringify({
  livekitJwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig",
  wsUrl: "wss://livekit.example.com",
  roomName: "meeting-cltest123",
  displayName: "Alex Guest",
});

describe("parseGuestMeetingCredentials", () => {
  it("returns parsed credentials for a valid payload", () => {
    expect(parseGuestMeetingCredentials(VALID)).toEqual({
      livekitJwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig",
      wsUrl: "wss://livekit.example.com",
      roomName: "meeting-cltest123",
      displayName: "Alex Guest",
    });
  });

  it("returns null for null input (sessionStorage miss)", () => {
    expect(parseGuestMeetingCredentials(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseGuestMeetingCredentials("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseGuestMeetingCredentials("{not json")).toBeNull();
    expect(parseGuestMeetingCredentials("{}")).toBeNull();
    expect(parseGuestMeetingCredentials("null")).toBeNull();
    expect(parseGuestMeetingCredentials("[]")).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const noJwt = JSON.stringify({
      wsUrl: "wss://x",
      roomName: "r",
      displayName: "n",
    });
    const noWs = JSON.stringify({
      livekitJwt: "j",
      roomName: "r",
      displayName: "n",
    });
    const noRoom = JSON.stringify({
      livekitJwt: "j",
      wsUrl: "wss://x",
      displayName: "n",
    });
    const noName = JSON.stringify({
      livekitJwt: "j",
      wsUrl: "wss://x",
      roomName: "r",
    });
    expect(parseGuestMeetingCredentials(noJwt)).toBeNull();
    expect(parseGuestMeetingCredentials(noWs)).toBeNull();
    expect(parseGuestMeetingCredentials(noRoom)).toBeNull();
    expect(parseGuestMeetingCredentials(noName)).toBeNull();
  });

  it("returns null when a required field is empty string", () => {
    const emptyJwt = JSON.stringify({
      livekitJwt: "",
      wsUrl: "wss://x",
      roomName: "r",
      displayName: "n",
    });
    const emptyName = JSON.stringify({
      livekitJwt: "j",
      wsUrl: "wss://x",
      roomName: "r",
      displayName: "",
    });
    expect(parseGuestMeetingCredentials(emptyJwt)).toBeNull();
    expect(parseGuestMeetingCredentials(emptyName)).toBeNull();
  });

  it("returns null when a required field is non-string", () => {
    const numJwt = JSON.stringify({
      livekitJwt: 42,
      wsUrl: "wss://x",
      roomName: "r",
      displayName: "n",
    });
    const objName = JSON.stringify({
      livekitJwt: "j",
      wsUrl: "wss://x",
      roomName: "r",
      displayName: { evil: true },
    });
    expect(parseGuestMeetingCredentials(numJwt)).toBeNull();
    expect(parseGuestMeetingCredentials(objName)).toBeNull();
  });

  it("ignores extra fields and only returns the 4 known ones", () => {
    const extra = JSON.stringify({
      livekitJwt: "j",
      wsUrl: "wss://x",
      roomName: "r",
      displayName: "n",
      organizationId: "INJECTED",
      isHost: true,
      __proto__: { polluted: true },
    });
    const result = parseGuestMeetingCredentials(extra);
    expect(result).toEqual({
      livekitJwt: "j",
      wsUrl: "wss://x",
      roomName: "r",
      displayName: "n",
    });
    // Defense — make sure injected fields are not in the result
    expect(result && "organizationId" in result).toBe(false);
    expect(result && "isHost" in result).toBe(false);
  });
});
