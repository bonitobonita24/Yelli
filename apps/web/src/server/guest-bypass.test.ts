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

import { shouldBypassAuthForGuest } from "@/server/guest-bypass";

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
