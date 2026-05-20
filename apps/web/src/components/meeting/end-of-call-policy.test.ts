/**
 * (meeting-room-guest-disconnect-redirect): pure policy that decides
 * where the meeting page should send the user after the call ends or
 * fails, based ONLY on whether the user is a sessionless guest.
 *
 * The redirect target for hosts is `/app/meetings` (an authed-only
 * route). For sessionless guests that destination 302s to `/login`,
 * which is wrong UX — the guest's session is over and they should land
 * on the public root, not be asked to log in. This policy keeps the
 * decision out of the React component so it's unit-testable in the
 * `environment: "node"` vitest config (no jsdom / no RTL).
 */

import { describe, expect, it } from "vitest";

import { endOfCallPolicy } from "./end-of-call-policy";

describe("endOfCallPolicy", () => {
  describe("host path (isGuest: false)", () => {
    it("returns the /app/meetings redirect after status=ended", () => {
      const policy = endOfCallPolicy({ isGuest: false });
      expect(policy.redirectAfterEnded).toBe("/app/meetings");
    });

    it("returns the existing 'Redirecting…' copy on the ended screen", () => {
      const policy = endOfCallPolicy({ isGuest: false });
      // Existing host UX — match the live string so the host flow is
      // visually unchanged after this refactor.
      expect(policy.endedMessage).toBe("Meeting ended. Redirecting…");
    });

    it("returns the /app/meetings CTA on the failed screen", () => {
      const policy = endOfCallPolicy({ isGuest: false });
      expect(policy.failedCtaHref).toBe("/app/meetings");
      expect(policy.failedCtaLabel).toBe("Back to meetings");
    });
  });

  describe("guest path (isGuest: true)", () => {
    it("returns NO redirect after status=ended (null)", () => {
      // The whole point of this ticket: guests must NOT auto-navigate
      // to `/app/meetings` because it 302s sessionless requests to /login.
      const policy = endOfCallPolicy({ isGuest: true });
      expect(policy.redirectAfterEnded).toBeNull();
    });

    it("returns a guest-appropriate ended message (no 'Redirecting…')", () => {
      const policy = endOfCallPolicy({ isGuest: true });
      // Generic, no information leak (Rule 0 / security.md §AUTH DEFAULTS):
      // same copy whether the meeting was ended by host, network drop,
      // token expiry, or LiveKit error.
      expect(policy.endedMessage).not.toContain("Redirecting");
      expect(policy.endedMessage.length).toBeGreaterThan(0);
    });

    it("returns the public root '/' as the failed CTA target", () => {
      const policy = endOfCallPolicy({ isGuest: true });
      // Guests have no session — sending them to /app/meetings would
      // 302 to /login, which is exactly the bug. Root is public.
      expect(policy.failedCtaHref).toBe("/");
      expect(policy.failedCtaLabel.length).toBeGreaterThan(0);
    });

    it("never returns /app/meetings anywhere for guests", () => {
      // Defense-in-depth assertion: any future addition to the policy
      // shape that introduces a new href field should NOT default to
      // the protected /app/meetings route for guests.
      const policy = endOfCallPolicy({ isGuest: true });
      const allHrefs = [policy.redirectAfterEnded, policy.failedCtaHref];
      for (const href of allHrefs) {
        expect(href).not.toBe("/app/meetings");
      }
    });
  });

  describe("input narrowness", () => {
    it("depends only on isGuest — same input, same output", () => {
      // Pure function contract: deterministic, referentially transparent.
      // No hidden globals, no Date.now(), no random ids.
      const a = endOfCallPolicy({ isGuest: true });
      const b = endOfCallPolicy({ isGuest: true });
      expect(a).toEqual(b);

      const h1 = endOfCallPolicy({ isGuest: false });
      const h2 = endOfCallPolicy({ isGuest: false });
      expect(h1).toEqual(h2);
    });
  });
});
