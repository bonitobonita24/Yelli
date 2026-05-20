/**
 * Tenant resolution + auth guard.
 * Cross-check between URL-derived tenant and session.user.organizationId
 * per .claude/rules/security.md §TENANT MIDDLEWARE SAFETY.
 * Super-admin bypass allowed.
 */

import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { authConfig } from "@/server/auth.config";
import {
  GUEST_BYPASS_HEADER,
  shouldBypassAuthForGuest,
} from "@/server/guest-bypass";
import {
  buildTenantRedirectUrl,
  resolveTenantRedirect,
  stripTenantPathPrefix,
} from "@/server/tenant-redirect";

// Edge-safe Auth.js instance — uses the shell config without Credentials/bcrypt/Prisma.
// The full server instance lives in @/server/auth and is used by route handlers + tRPC.
const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = ["/app", "/admin", "/superadmin"] as const;
// Public prefixes (/login, /register, /forgot-password, /join, /api/auth) are
// implicitly allowed — anything outside PROTECTED_PREFIXES + non-static is public.

const APEX_HOSTS = ["yelli.powerbyte.app", "yelli-staging.powerbyte.app"] as const;

function extractTenantSlug(hostname: string, pathname: string): string | null {
  // Subdomain pattern: acme.yelli.powerbyte.app → "acme"
  // Skip apex hosts and local dev hosts
  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname);

  if (!isLocal && !(APEX_HOSTS as readonly string[]).includes(hostname)) {
    const parts = hostname.split(".");
    // Must have at least 4 parts: slug.yelli.powerbyte.app
    if (parts.length >= 4 && parts[0]) {
      return parts[0];
    }
  }

  // Path pattern: /t/[slug]/... (dev convenience — no subdomain routing on localhost)
  const pathParts = pathname.split("/").filter(Boolean);
  if (pathParts[0] === "t" && pathParts[1]) {
    return pathParts[1];
  }

  return null;
}

export default auth(async (req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  // Skip static assets and Next.js internals early — no auth overhead
  if (
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    /\.[a-z0-9]+$/i.test(path)
  ) {
    return NextResponse.next();
  }

  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0] ?? "";
  const tenantSlug = extractTenantSlug(hostname, path);

  // (t-slug-dev-routes-broken): when slug arrives via /t/{slug}/<rest> on
  // localhost dev, strip the prefix so isProtected, the tenant cross-check,
  // and downstream route resolution all see the canonical /app, /admin,
  // /superadmin paths. Without the strip, /t/yelli/app always 404s because
  // there is no route handler under /t/[slug]/.
  const effectivePath = tenantSlug
    ? stripTenantPathPrefix(path, tenantSlug)
    : path;
  const wasPathStripped = effectivePath !== path;

  // (guest-meeting-page-render): /app/meeting/{id}?guest=1 bypasses the
  // PROTECTED_PREFIXES gate so guests arriving from /join/{token} can
  // reach the meeting page without a session. Page-level validation
  // (sessionStorage credential read) is the primary defense; this
  // bypass only changes routing. See @/server/guest-bypass for the
  // exact-shape match rules.
  const isGuestBypass = shouldBypassAuthForGuest({
    path: effectivePath,
    searchParams: nextUrl.searchParams,
  });

  const isProtected =
    !isGuestBypass &&
    PROTECTED_PREFIXES.some(
      (p) => effectivePath === p || effectivePath.startsWith(`${p}/`),
    );

  const session = req.auth;

  // Redirect unauthenticated users attempting protected routes to login.
  // callbackUrl preserves the ORIGINAL /t/{slug}/... so login returns the
  // user to the same tenant-prefixed URL.
  if (isProtected && !session?.user) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set(
      "callbackUrl",
      nextUrl.pathname + nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  // §TENANT MIDDLEWARE SAFETY (security.md): on protected routes, the
  // URL-derived org slug must match the session's organizationSlug, or
  // we redirect to the user's correct subdomain. Super-admins get an
  // exception on /superadmin paths only (Phase 7 #7c option C). The
  // slug now lives in the JWT (Phase 7 #7c-1) so no DB round-trip here.
  // Pass effectivePath so the /superadmin bypass matches dev URLs too.
  if (isProtected && session?.user && tenantSlug) {
    const decision = resolveTenantRedirect({
      urlSlug: tenantSlug,
      sessionSlug: session.user.organizationSlug,
      isSuperAdmin: session.user.isSuperAdmin,
      path: effectivePath,
    });
    if (decision.kind === "redirect") {
      const redirectUrl = buildTenantRedirectUrl({
        currentHostname: hostname,
        currentPath: path,
        currentSearch: nextUrl.search,
        currentUrlSlug: tenantSlug,
        targetSlug: decision.targetSlug,
        origin: nextUrl.origin,
      });
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Attach enriched headers for tRPC context and route handlers. After the
  // cross-check above, when both slugs are present they are equal.
  const requestHeaders = new Headers(req.headers);

  if (tenantSlug) {
    requestHeaders.set("x-tenant-slug", tenantSlug);
  }

  if (session?.user) {
    requestHeaders.set("x-user-id", session.user.id);
    requestHeaders.set("x-organization-id", session.user.organizationId);
    requestHeaders.set("x-organization-slug", session.user.organizationSlug);
  }

  // (guest-meeting-layout-bypass): propagate the bypass decision to the
  // /app/* Server Component layout so it can skip its own auth() gate +
  // skip wrapping the guest tree in <SocketProvider>. The decision was
  // made up at line 87 using the URL — the layout has no way to read the
  // URL in a Server Component, so we pass the boolean through a request
  // header. See @/server/guest-bypass for the consumer side.
  if (isGuestBypass) {
    requestHeaders.set(GUEST_BYPASS_HEADER, "1");
  }

  // (t-slug-dev-routes-broken): rewrite to the stripped path so Next.js
  // route resolution serves the existing /app, /admin, /superadmin tree.
  // Headers (including x-tenant-slug) are preserved through the rewrite.
  if (wasPathStripped) {
    const rewriteUrl = new URL(
      effectivePath + nextUrl.search,
      nextUrl.origin,
    );
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
