/**
 * Phase 7 #7(c)-1 — JWT + session shape carries organizationSlug.
 *
 * Exercises `authConfig.callbacks.jwt` and `authConfig.callbacks.session`
 * directly (the Edge-safe shell used by middleware). The full server config
 * in `auth.ts` spreads `authConfig` and is covered by its own session re-
 * validation logic; the slug propagation contract is the same in both.
 *
 * Why a slug at all? Subdomain routing (`[org-slug].yelli.powerbyte.app`)
 * needs the middleware to cross-check URL slug vs session without a DB
 * round-trip per request. Encoding it in the JWT closes that gap (see
 * `apps/web/src/middleware.ts` line ~96 TODO).
 */
import { describe, expect, it } from "vitest";

import { authConfig } from "@/server/auth.config";

import type { Session } from "next-auth";

// Helper: cast through `never` so the test compiles in the pre-implementation
// state where User/JWT/Session.user do not yet declare organizationSlug. The
// runtime contract is what matters here — types/next-auth.d.ts updates land
// alongside the callback wiring in the GREEN phase.
const callJwt = (args: unknown) =>
  (authConfig.callbacks as never as {
    jwt: (a: unknown) => Promise<Record<string, unknown>>;
  }).jwt(args);

const callSession = (args: unknown) =>
  (authConfig.callbacks as never as {
    session: (a: unknown) => Promise<Session>;
  }).session(args);

const validUser = {
  id: "user-1",
  email: "user@acme.com",
  organizationId: "org-1",
  organizationSlug: "acme-corp",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
  displayName: "Test User",
};

const validToken = {
  userId: "user-1",
  organizationId: "org-1",
  organizationSlug: "acme-corp",
  role: "tenant_admin",
  isSuperAdmin: false,
  securityVersion: 1,
};

const baseSession = () =>
  ({
    user: {} as never,
    expires: new Date(Date.now() + 60_000).toISOString(),
  }) as Session;

describe("authConfig.callbacks.jwt", () => {
  it("writes organizationSlug from user into token on login", async () => {
    const token = await callJwt({ token: {}, user: validUser, account: null });
    expect(token.organizationSlug).toBe("acme-corp");
  });

  it("still writes organizationId (regression guard for existing behavior)", async () => {
    const token = await callJwt({ token: {}, user: validUser, account: null });
    expect(token.organizationId).toBe("org-1");
  });

  it("passes token through unchanged when no user (subsequent requests)", async () => {
    const existing = { userId: "user-1", organizationSlug: "acme-corp" };
    const token = await callJwt({ token: existing, user: undefined, account: null });
    expect(token.organizationSlug).toBe("acme-corp");
  });
});

describe("authConfig.callbacks.session (edge-safe)", () => {
  it("copies organizationSlug from token into session.user", async () => {
    const result = await callSession({ session: baseSession(), token: validToken });
    expect(result.user?.organizationSlug).toBe("acme-corp");
  });

  it("returns user: undefined when organizationSlug is missing from token", async () => {
    const tokenWithoutSlug = { ...validToken, organizationSlug: undefined };
    const result = await callSession({ session: baseSession(), token: tokenWithoutSlug });
    expect(result.user).toBeUndefined();
  });

  it("returns user: undefined when organizationId is missing (regression guard)", async () => {
    const tokenWithoutOrgId = { ...validToken, organizationId: undefined };
    const result = await callSession({ session: baseSession(), token: tokenWithoutOrgId });
    expect(result.user).toBeUndefined();
  });

  it("preserves existing organizationId assignment (regression guard)", async () => {
    const result = await callSession({ session: baseSession(), token: validToken });
    expect(result.user?.organizationId).toBe("org-1");
  });
});
