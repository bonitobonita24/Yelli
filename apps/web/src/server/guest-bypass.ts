/**
 * Guest-meeting middleware bypass decision.
 *
 * Used by `apps/web/src/middleware.ts` so a guest arriving from the
 * `/join/[token]` flow can reach `/app/meeting/{id}?guest=1` without
 * being 302'd to /login by the PROTECTED_PREFIXES gate.
 *
 * Security posture (defense-in-depth):
 *   1. Bypass is narrow: only `/app/meeting/{id}` exact-shape AND `?guest=1`.
 *      No nested subroutes, no other protected paths, no fuzzy values.
 *   2. Page-level validation is the primary gate — the meeting page reads
 *      `sessionStorage["yelli:guest-meeting:{meetingId}"]` and rejects
 *      requests with missing/malformed credentials before render.
 *   3. The LiveKit JWT itself is the cryptographic credential — minted
 *      server-side by `meetings.exchangeGuestToken` after Turnstile +
 *      rate-limit pass. Bypass only changes routing; it does not grant
 *      access to LiveKit (the JWT is verified by LiveKit on websocket
 *      connect).
 *
 * Pure function — no Node-only or Edge-only APIs — kept outside
 * middleware.ts so the Node-based test runner can import it directly.
 */

// Single-segment cuid/cuid2/uuid id pattern. Matches the loose id check
// in `apps/web/src/app/app/meeting/[id]/page.tsx` (real validation lives
// in the tRPC procedure). One or more URL-safe id chars, no slashes.
const MEETING_PATH_RE = /^\/app\/meeting\/[A-Za-z0-9_-]+$/;

export function shouldBypassAuthForGuest(args: {
  path: string;
  searchParams: URLSearchParams;
}): boolean {
  if (!MEETING_PATH_RE.test(args.path)) return false;
  return args.searchParams.get("guest") === "1";
}
