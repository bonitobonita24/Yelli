/**
 * Guest-meeting sessionStorage credential parser.
 *
 * The /join/[token] page persists the result of
 * `meetings.exchangeGuestToken` to sessionStorage under
 * `yelli:guest-meeting:{meetingId}`. When the guest lands on
 * /app/meeting/{id}?guest=1 the Client-Component loader reads that
 * raw string and runs it through this parser before connecting to
 * LiveKit.
 *
 * Why a separate parser:
 *   - sessionStorage is client-only — keeping the parse logic pure
 *     means it can be unit-tested under the Node-only vitest config
 *     (the project does not have jsdom/happy-dom wired up).
 *   - Defense-in-depth: even though the loader is the only writer,
 *     the read side validates the shape so any future tampering or
 *     storage-eviction edge case fails closed (null → redirect),
 *     never undefined-deref.
 *   - Strips unknown keys via explicit field copy — prevents an
 *     attacker who somehow modified sessionStorage from injecting
 *     fields like `organizationId` or `isHost` that downstream code
 *     might trust.
 *
 * The returned credentials are passed verbatim to the LiveKit Room
 * constructor — the JWT is the cryptographic credential, minted
 * server-side; this parser only checks shape, never authenticity.
 */

export interface GuestMeetingCredentials {
  livekitJwt: string;
  wsUrl: string;
  roomName: string;
  displayName: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export function parseGuestMeetingCredentials(
  raw: string | null,
): GuestMeetingCredentials | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  if (
    !isNonEmptyString(obj.livekitJwt) ||
    !isNonEmptyString(obj.wsUrl) ||
    !isNonEmptyString(obj.roomName) ||
    !isNonEmptyString(obj.displayName)
  ) {
    return null;
  }

  // Explicit field copy — drops any extra keys an attacker might have
  // injected (organizationId, isHost, __proto__, etc.).
  return {
    livekitJwt: obj.livekitJwt,
    wsUrl: obj.wsUrl,
    roomName: obj.roomName,
    displayName: obj.displayName,
  };
}

/**
 * Canonical sessionStorage key for a given meeting's guest credentials.
 * Used by both the writer (/join/[token]) and the reader
 * (apps/web/src/components/meeting/guest-meeting-room-loader.tsx) to
 * avoid drift.
 */
export function guestCredentialsStorageKey(meetingId: string): string {
  return `yelli:guest-meeting:${meetingId}`;
}
