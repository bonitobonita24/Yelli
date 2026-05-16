/**
 * Tenant URL ↔ session cross-check helpers.
 *
 * Used by `apps/web/src/middleware.ts` to enforce the
 * security.md §TENANT MIDDLEWARE SAFETY rule: a URL-derived org slug
 * must match the slug encoded in the session JWT, or the request is
 * redirected to the user's correct subdomain.
 *
 * These helpers are pure (no Node-only or Edge-only APIs) so they live
 * outside `middleware.ts` itself — which imports `next-auth` and
 * `next/server` and therefore can't be loaded by the Node-based test
 * runner. Co-locating with auth.config.ts under server/ matches the
 * existing convention for Edge-runtime-safe code.
 *
 * Super-admin policy (Phase 7 #7c, option C — user-confirmed 2026-05-16):
 *   - Path `/superadmin` or `/superadmin/*` → bypass slug check
 *     (super-admin can administer any tenant from any subdomain).
 *   - All other paths → enforce match; super-admin is NOT exempt and
 *     gets redirected to their own org subdomain on mismatch.
 *
 * Why we encode the slug in the JWT (rather than DB-lookup per request):
 * the slug check runs on every Edge request and a DB round-trip would
 * dominate p99 latency. Slug rename freshness is provided by the Node-
 * side session callback in auth.ts which re-fetches `organization.slug`
 * on every session read.
 */

export type RedirectDecision =
  | { kind: "allow" }
  | { kind: "redirect"; targetSlug: string };

export function resolveTenantRedirect(args: {
  urlSlug: string | null;
  sessionSlug: string | null;
  isSuperAdmin: boolean;
  path: string;
}): RedirectDecision {
  // No URL slug — apex host or localhost without /t/{slug} prefix.
  // Slug check doesn't apply; tenant context is established elsewhere.
  if (!args.urlSlug) return { kind: "allow" };

  // No session slug — defensive. The session callback in auth.config.ts
  // returns user: undefined when organizationSlug is missing, so this
  // branch should not be reachable in practice with the (c)-1 wiring.
  if (!args.sessionSlug) return { kind: "allow" };

  // Slug matches — happy path.
  if (args.urlSlug === args.sessionSlug) return { kind: "allow" };

  // Super-admin on /superadmin or /superadmin/* — option C bypass.
  // We DO NOT match /superadminer/* or other prefix lookalikes.
  if (
    args.isSuperAdmin &&
    (args.path === "/superadmin" || args.path.startsWith("/superadmin/"))
  ) {
    return { kind: "allow" };
  }

  // Mismatch — redirect to the user's correct slug.
  return { kind: "redirect", targetSlug: args.sessionSlug };
}

export function buildTenantRedirectUrl(args: {
  currentHostname: string;
  currentPath: string;
  currentSearch: string;
  currentUrlSlug: string;
  targetSlug: string;
  origin: string;
}): URL {
  // Subdomain pattern: first hostname label equals current slug AND host
  // has at least 4 dot-separated parts (slug.app.domain.tld).
  const parts = args.currentHostname.split(".");
  const isSubdomainPattern =
    parts.length >= 4 && parts[0] === args.currentUrlSlug;

  if (isSubdomainPattern) {
    // Swap the leading label; preserve port + protocol from origin.
    parts[0] = args.targetSlug;
    const newHostname = parts.join(".");
    const originUrl = new URL(args.origin);
    const port = originUrl.port ? `:${originUrl.port}` : "";
    return new URL(
      `${originUrl.protocol}//${newHostname}${port}${args.currentPath}${args.currentSearch}`,
    );
  }

  // Path pattern: /t/{currentUrlSlug}(/...)? → /t/{targetSlug}(/...)?
  const newPath = args.currentPath.replace(
    new RegExp(`^/t/${escapeRegex(args.currentUrlSlug)}(/|$)`),
    `/t/${args.targetSlug}$1`,
  );
  return new URL(`${newPath}${args.currentSearch}`, args.origin);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
