/**
 * (meeting-room-guest-disconnect-redirect): pure helper deciding the
 * post-call routing + copy for the meeting page. Splits the previously
 * inlined `router.replace("/app/meetings")` decision out of the React
 * component so the host vs guest behaviour is unit-testable in the
 * `environment: "node"` vitest config (no jsdom / no RTL).
 *
 * Why: `/app/meetings` is auth-only. Sessionless guests hitting it get
 * 302'd to `/login?callbackUrl=…` — bad UX when their call just ended.
 * Guests should stay on the meeting page (no redirect) and see a
 * generic end-of-call screen. Hosts retain the existing redirect.
 *
 * Security note (security.md §AUTH DEFAULTS): the guest ended-message
 * is intentionally generic — same copy regardless of disconnect cause
 * (host ended call, network drop, token expiry, LiveKit error) so no
 * information about meeting existence/status leaks via this surface.
 */

export interface EndOfCallPolicy {
  /** Path to navigate to after status === "ended", or null to stay put. */
  redirectAfterEnded: string | null;
  /** Copy shown on the "ended" status screen. */
  endedMessage: string;
  /** Destination href for the "failed" status CTA button. */
  failedCtaHref: string;
  /** Visible label for the "failed" status CTA button. */
  failedCtaLabel: string;
}

export function endOfCallPolicy(opts: { isGuest: boolean }): EndOfCallPolicy {
  if (opts.isGuest) {
    return {
      redirectAfterEnded: null,
      endedMessage: "Meeting ended. Thanks for joining.",
      failedCtaHref: "/",
      failedCtaLabel: "Return to home",
    };
  }
  return {
    redirectAfterEnded: "/app/meetings",
    endedMessage: "Meeting ended. Redirecting…",
    failedCtaHref: "/app/meetings",
    failedCtaLabel: "Back to meetings",
  };
}
