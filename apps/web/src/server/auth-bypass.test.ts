/**
 * (auth-bypass-for-e2e) — Playwright/E2E auth bypass helper tests.
 *
 * Purpose: provide a deterministic, no-Turnstile, no-bcrypt auth path for
 * Playwright smoke tests. Replaces the manual "stop the dev container"
 * recipe from [[playwright-smoke-auth-configuration-blocker]] with an
 * env-gated provider that never registers when APP_ENV === "production".
 *
 * Security model:
 *   - Bypass is gated by TWO independent conditions (both required):
 *       1. AUTH_BYPASS_FOR_E2E === true (boolean from env schema)
 *       2. APP_ENV !== "production"
 *   - If either guard is missing, isE2EBypassEnabled() returns false and the
 *     provider is never registered in NextAuth's providers array.
 *   - authorizeE2EBypass() still goes through platformPrisma to fetch the
 *     real user record — it skips bcrypt, not authorization. Suspended orgs,
 *     inactive users, and missing emails all return null exactly like the
 *     real authorize().
 *   - Returns the SAME shape as the real authorize() — so downstream JWT +
 *     session callbacks treat the bypass session identically.
 */
import { describe, expect, it } from "vitest";

import {
  authorizeE2EBypass,
  isE2EBypassEnabled,
} from "@/server/auth-bypass";

// Minimal Prisma stub matching the surface area authorizeE2EBypass touches.
// Mirrors the same query authorize() in auth.ts uses for the no-org-slug
// path (single active user lookup by email).
type FakeUserRow = {
  id: string;
  email: string;
  organization_id: string;
  role: "tenant_admin" | "host" | "participant";
  is_super_admin: boolean;
  security_version: number;
  display_name: string;
  organization: { id: string; slug: string; suspended_at: Date | null };
};

function buildFakeDb(rows: FakeUserRow[]) {
  return {
    user: {
      findMany: async (args: {
        where: { email: string; status: string };
        take?: number;
      }) => {
        const match = rows.filter((r) => r.email === args.where.email);
        return match.slice(0, args.take ?? match.length);
      },
    },
  };
}

const activeUser: FakeUserRow = {
  id: "user-1",
  email: "host@acme.com",
  organization_id: "org-1",
  role: "host",
  is_super_admin: false,
  security_version: 1,
  display_name: "Host Tester",
  organization: { id: "org-1", slug: "acme", suspended_at: null },
};

describe("isE2EBypassEnabled", () => {
  it("returns true when AUTH_BYPASS_FOR_E2E=true and APP_ENV=development", () => {
    expect(
      isE2EBypassEnabled({
        AUTH_BYPASS_FOR_E2E: true,
        APP_ENV: "development",
      }),
    ).toBe(true);
  });

  it("returns true when AUTH_BYPASS_FOR_E2E=true and APP_ENV=staging", () => {
    expect(
      isE2EBypassEnabled({ AUTH_BYPASS_FOR_E2E: true, APP_ENV: "staging" }),
    ).toBe(true);
  });

  it("returns false when AUTH_BYPASS_FOR_E2E=true but APP_ENV=production", () => {
    expect(
      isE2EBypassEnabled({
        AUTH_BYPASS_FOR_E2E: true,
        APP_ENV: "production",
      }),
    ).toBe(false);
  });

  it("returns false when AUTH_BYPASS_FOR_E2E=false", () => {
    expect(
      isE2EBypassEnabled({
        AUTH_BYPASS_FOR_E2E: false,
        APP_ENV: "development",
      }),
    ).toBe(false);
  });
});

describe("authorizeE2EBypass", () => {
  it("returns the auth.ts-shaped user object for an active user lookup by email", async () => {
    const db = buildFakeDb([activeUser]);
    const result = await authorizeE2EBypass(
      { email: "host@acme.com" },
      db as never,
    );
    expect(result).toEqual({
      id: "user-1",
      email: "host@acme.com",
      organizationId: "org-1",
      organizationSlug: "acme",
      role: "host",
      isSuperAdmin: false,
      securityVersion: 1,
      displayName: "Host Tester",
    });
  });

  it("returns null when email is missing or empty", async () => {
    const db = buildFakeDb([activeUser]);
    expect(
      await authorizeE2EBypass({ email: undefined }, db as never),
    ).toBeNull();
    expect(await authorizeE2EBypass({ email: "" }, db as never)).toBeNull();
    expect(await authorizeE2EBypass({}, db as never)).toBeNull();
  });

  it("returns null when no user matches the email", async () => {
    const db = buildFakeDb([activeUser]);
    expect(
      await authorizeE2EBypass({ email: "nobody@acme.com" }, db as never),
    ).toBeNull();
  });

  it("returns null when the user's organization is suspended", async () => {
    const suspended: FakeUserRow = {
      ...activeUser,
      organization: { ...activeUser.organization, suspended_at: new Date() },
    };
    const db = buildFakeDb([suspended]);
    expect(
      await authorizeE2EBypass({ email: "host@acme.com" }, db as never),
    ).toBeNull();
  });

  it("returns null when multiple users share the same email (ambiguous lookup)", async () => {
    const second: FakeUserRow = { ...activeUser, id: "user-2", organization_id: "org-2" };
    const db = buildFakeDb([activeUser, second]);
    expect(
      await authorizeE2EBypass({ email: "host@acme.com" }, db as never),
    ).toBeNull();
  });
});
