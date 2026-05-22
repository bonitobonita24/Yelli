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

/**
 * Strip `/t/{slug}` prefix from a pathname, returning the effective path
 * that downstream Next.js route resolution should serve.
 *
 *   /t/yelli/app/foo + slug="yelli" → /app/foo
 *   /t/yelli/app     + slug="yelli" → /app
 *   /t/yelli/        + slug="yelli" → /
 *   /t/yelli         + slug="yelli" → /
 *   /app/foo         + slug="yelli" → /app/foo  (no-op)
 *   /t/other/app     + slug="yelli" → /t/other/app  (no-op — slug arg mismatch)
 *
 * Pure function. The middleware passes the strip result to
 * `NextResponse.rewrite` so existing /app, /admin, /superadmin route
 * handlers serve dev URLs that carry the tenant slug in the path.
 */
export function stripTenantPathPrefix(path: string, slug: string): string {
  if (!slug) return path;
  const match = path.match(
    new RegExp(`^/t/${escapeRegex(slug)}(?:/(.*))?$`),
  );
  if (!match) return path;
  const rest = match[1] ?? "";
  return rest === "" ? "/" : `/${rest}`;
}

/**
 * Prepend a `/t/{slug}` URL prefix to a target redirect path so that RSC
 * bounces (e.g. host role visits /admin → layout `redirect("/app")`) preserve
 * the tenant context in the URL bar instead of stripping it.
 *
 * Subdomain pattern (prod): prefix is "" (tenant context lives in hostname),
 * so the target passes through unchanged.
 *
 *   buildTenantBouncePath("/app", "")               → "/app"   (subdomain / apex)
 *   buildTenantBouncePath("/app", "/t/system")      → "/t/system/app"
 *   buildTenantBouncePath("/login?callbackUrl=/x", "/t/acme")
 *                                                   → "/t/acme/login?callbackUrl=/x"
 *
 * Pure function. Middleware writes the prefix into a request header
 * (`x-tenant-path-prefix`); RSC layouts/pages read it via `next/headers` and
 * pass it through this helper before calling `redirect(...)`.
 *
 * (admin-bounce-prefix-symmetry — Phase 7 #17 follow-up filed in
 * [[rule-16-cleanup-2026-05-22]] queue.)
 */
export function buildTenantBouncePath(target: string, prefix: string): string {
  if (!prefix) return target;
  const trimmedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (target === "") return trimmedPrefix;
  const targetWithLeading = target.startsWith("/") ? target : `/${target}`;
  return `${trimmedPrefix}${targetWithLeading}`;
}
