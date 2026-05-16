/**
 * Phase 7 #7(c)-2 — middleware URL ↔ session cross-check.
 *
 * Pure-function tests for the two helpers wired into the default export:
 *   - `resolveTenantRedirect` — allow vs redirect-to-target-slug decision
 *   - `buildTenantRedirectUrl` — subdomain swap OR /t/{slug} path swap
 *
 * Super-admin policy (option C, user-confirmed):
 *   - Path `/superadmin/*` → bypass slug check (super-admin can administer
 *     from any subdomain).
 *   - All other paths → enforce match; super-admin not exempt and gets
 *     redirected to their own org subdomain on mismatch.
 *
 * The full `auth()` wrapper is exercised via E2E later; here we lock the
 * decision logic where the security-critical branches live.
 */
import { describe, expect, it } from "vitest";

import { buildTenantRedirectUrl, resolveTenantRedirect } from "@/server/tenant-redirect";

describe("resolveTenantRedirect", () => {
  it("allows when no URL slug (apex / localhost without /t/ prefix)", () => {
    expect(
      resolveTenantRedirect({
        urlSlug: null,
        sessionSlug: "acme",
        isSuperAdmin: false,
        path: "/app/foo",
      }),
    ).toEqual({ kind: "allow" });
  });

  it("allows when URL slug matches session slug", () => {
    expect(
      resolveTenantRedirect({
        urlSlug: "acme",
        sessionSlug: "acme",
        isSuperAdmin: false,
        path: "/app/foo",
      }),
    ).toEqual({ kind: "allow" });
  });

  it("redirects to session slug when URL slug differs and user is NOT super-admin", () => {
    expect(
      resolveTenantRedirect({
        urlSlug: "evil",
        sessionSlug: "acme",
        isSuperAdmin: false,
        path: "/app/foo",
      }),
    ).toEqual({ kind: "redirect", targetSlug: "acme" });
  });

  it("allows super-admin on /superadmin/* path even when slug mismatches (option C bypass)", () => {
    expect(
      resolveTenantRedirect({
        urlSlug: "acme",
        sessionSlug: "platform-org",
        isSuperAdmin: true,
        path: "/superadmin/users",
      }),
    ).toEqual({ kind: "allow" });
  });

  it("allows super-admin on /superadmin (exact, no trailing) when slug mismatches", () => {
    expect(
      resolveTenantRedirect({
        urlSlug: "acme",
        sessionSlug: "platform-org",
        isSuperAdmin: true,
        path: "/superadmin",
      }),
    ).toEqual({ kind: "allow" });
  });

  it("redirects super-admin on NON-/superadmin path when slug mismatches (option C non-bypass)", () => {
    expect(
      resolveTenantRedirect({
        urlSlug: "acme",
        sessionSlug: "platform-org",
        isSuperAdmin: true,
        path: "/app/foo",
      }),
    ).toEqual({ kind: "redirect", targetSlug: "platform-org" });
  });

  it("treats /superadminer/* (similar prefix) as NON-bypass — exact /superadmin or /superadmin/ only", () => {
    expect(
      resolveTenantRedirect({
        urlSlug: "acme",
        sessionSlug: "platform-org",
        isSuperAdmin: true,
        path: "/superadminer/foo",
      }),
    ).toEqual({ kind: "redirect", targetSlug: "platform-org" });
  });

  it("allows when session has no slug (defensive — session.user was filtered earlier)", () => {
    // Should not occur in practice — auth.config.ts session callback returns
    // user: undefined when organizationSlug is missing. Defensive guard only.
    expect(
      resolveTenantRedirect({
        urlSlug: "acme",
        sessionSlug: null,
        isSuperAdmin: false,
        path: "/app/foo",
      }),
    ).toEqual({ kind: "allow" });
  });
});

describe("buildTenantRedirectUrl", () => {
  it("swaps subdomain prefix on production subdomain pattern", () => {
    const url = buildTenantRedirectUrl({
      currentHostname: "evil.yelli.powerbyte.app",
      currentPath: "/app/foo",
      currentSearch: "?bar=1",
      currentUrlSlug: "evil",
      targetSlug: "acme",
      origin: "https://evil.yelli.powerbyte.app",
    });
    expect(url.hostname).toBe("acme.yelli.powerbyte.app");
    expect(url.pathname).toBe("/app/foo");
    expect(url.search).toBe("?bar=1");
    expect(url.protocol).toBe("https:");
  });

  it("swaps subdomain on staging host pattern", () => {
    const url = buildTenantRedirectUrl({
      currentHostname: "evil.yelli-staging.powerbyte.app",
      currentPath: "/app",
      currentSearch: "",
      currentUrlSlug: "evil",
      targetSlug: "acme",
      origin: "https://evil.yelli-staging.powerbyte.app",
    });
    expect(url.hostname).toBe("acme.yelli-staging.powerbyte.app");
    expect(url.pathname).toBe("/app");
  });

  it("swaps /t/{slug} path on localhost dev pattern", () => {
    const url = buildTenantRedirectUrl({
      currentHostname: "localhost",
      currentPath: "/t/evil/app/foo",
      currentSearch: "?bar=1",
      currentUrlSlug: "evil",
      targetSlug: "acme",
      origin: "http://localhost:3000",
    });
    expect(url.pathname).toBe("/t/acme/app/foo");
    expect(url.search).toBe("?bar=1");
    expect(url.host).toBe("localhost:3000");
  });

  it("swaps /t/{slug} at exact path /t/{slug} (no trailing segment)", () => {
    const url = buildTenantRedirectUrl({
      currentHostname: "localhost",
      currentPath: "/t/evil",
      currentSearch: "",
      currentUrlSlug: "evil",
      targetSlug: "acme",
      origin: "http://localhost:3000",
    });
    expect(url.pathname).toBe("/t/acme");
  });

  it("preserves port in subdomain swap", () => {
    const url = buildTenantRedirectUrl({
      currentHostname: "evil.yelli.powerbyte.app",
      currentPath: "/app",
      currentSearch: "",
      currentUrlSlug: "evil",
      targetSlug: "acme",
      origin: "https://evil.yelli.powerbyte.app:8443",
    });
    expect(url.hostname).toBe("acme.yelli.powerbyte.app");
    expect(url.port).toBe("8443");
  });
});
