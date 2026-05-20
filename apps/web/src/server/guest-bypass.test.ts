/**
 * (guest-meeting-page-render) — middleware guest-bypass decision logic.
 *
 * Pure-function tests for `shouldBypassAuthForGuest`, the helper wired into
 * `apps/web/src/middleware.ts` so an unauthenticated guest arriving from the
 * `/join/[token]` flow can reach `/app/meeting/{id}?guest=1` without being
 * 302'd to /login.
 *
 * Security posture: bypass is intentionally narrow — exactly one path
 * pattern (`/app/meeting/{id}`) AND exactly one query value (`guest=1`).
 * Page-level validation (sessionStorage credential check) is the primary
 * defense; middleware bypass is only the routing concession.
 */
import { describe, expect, it } from "vitest";

import {
  isGuestBypassFromHeaders,
  shouldBypassAuthForGuest,
} from "@/server/guest-bypass";

describe("shouldBypassAuthForGuest", () => {
  it("returns true for /app/meeting/{id} with ?guest=1", () => {
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/cltest123abc",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(true);
  });

  it("returns false when guest param is missing", () => {
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/cltest123abc",
        searchParams: new URLSearchParams(""),
      }),
    ).toBe(false);
  });

  it("returns false when guest param value is not exactly '1'", () => {
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/cltest123abc",
        searchParams: new URLSearchParams("guest=true"),
      }),
    ).toBe(false);
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/cltest123abc",
        searchParams: new URLSearchParams("guest=yes"),
      }),
    ).toBe(false);
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/cltest123abc",
        searchParams: new URLSearchParams("guest=0"),
      }),
    ).toBe(false);
  });

  it("returns false for non-meeting protected paths even with ?guest=1", () => {
    expect(
      shouldBypassAuthForGuest({
        path: "/app/dashboard",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(false);
    expect(
      shouldBypassAuthForGuest({
        path: "/admin/users",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(false);
    expect(
      shouldBypassAuthForGuest({
        path: "/superadmin/orgs",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(false);
  });

  it("returns false for /app/meeting without a meeting id", () => {
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(false);
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(false);
  });

  it("returns false for /app/meeting/{id}/subroute (no nested guest access)", () => {
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/cltest123abc/settings",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(false);
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/cltest123abc/recordings",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(false);
  });

  it("returns false for path traversal attempts in the id segment", () => {
    // The id segment must contain at least one non-empty char and no slashes.
    // URL normalization typically prevents this, but be explicit.
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/../admin",
        searchParams: new URLSearchParams("guest=1"),
      }),
    ).toBe(false);
  });

  it("returns true even when other query params are present alongside guest=1", () => {
    expect(
      shouldBypassAuthForGuest({
        path: "/app/meeting/cltest123abc",
        searchParams: new URLSearchParams("guest=1&utm_source=email"),
      }),
    ).toBe(true);
  });
});

/**
 * (guest-meeting-layout-bypass) — Server Component side of the guest bypass.
 *
 * `isGuestBypassFromHeaders` is the layout-side companion to
 * `shouldBypassAuthForGuest`. Middleware computes the bypass decision once
 * per request (it has access to nextUrl), then propagates it to downstream
 * Server Components via the `x-yelli-guest-bypass` request header. The
 * `/app/*` layout reads that header to skip its own `auth() + redirect()`
 * gate and skip wrapping the guest tree in `<SocketProvider>` (which would
 * try to open an authenticated socket.io connection the guest can't use).
 *
 * Security posture: this helper is intentionally trivial — strict equality
 * on a single header value. The decision itself is made in middleware by
 * `shouldBypassAuthForGuest` (see above) where the URL is authoritative.
 * The layout MUST trust the header because it has no other way to know
 * the original request URL in a Server Component layout.
 */
describe("isGuestBypassFromHeaders", () => {
  it("returns true when x-yelli-guest-bypass is exactly '1'", () => {
    const headers = new Headers({ "x-yelli-guest-bypass": "1" });
    expect(isGuestBypassFromHeaders(headers)).toBe(true);
  });

  it("returns false when the header is absent", () => {
    const headers = new Headers();
    expect(isGuestBypassFromHeaders(headers)).toBe(false);
  });

  it("returns false when the header value is an empty string", () => {
    const headers = new Headers({ "x-yelli-guest-bypass": "" });
    expect(isGuestBypassFromHeaders(headers)).toBe(false);
  });

  it("returns false for any value other than exactly '1'", () => {
    // Note: the Fetch Headers spec trims leading/trailing whitespace on set,
    // so "1 " is normalized to "1" before our helper sees it — not in this
    // list. Test only the values that survive Headers normalization.
    const truthyLooking = ["true", "yes", "0", "on", "TRUE", "11", "01"];
    for (const value of truthyLooking) {
      const headers = new Headers({ "x-yelli-guest-bypass": value });
      expect(
        isGuestBypassFromHeaders(headers),
        `expected false for header value ${JSON.stringify(value)}`,
      ).toBe(false);
    }
  });

  it("is case-insensitive on the header name (HTTP standard)", () => {
    // Headers.get() lookup is case-insensitive per the Fetch spec — verify
    // the helper relies on standard behavior, not a manual lowercase match.
    const headers = new Headers({ "X-Yelli-Guest-Bypass": "1" });
    expect(isGuestBypassFromHeaders(headers)).toBe(true);
  });

  it("does not get fooled by a similarly-named header", () => {
    const headers = new Headers({ "x-yelli-guest-bypass-fake": "1" });
    expect(isGuestBypassFromHeaders(headers)).toBe(false);
  });
});
