/**
 * Tenant resolution + auth guard.
 * Cross-check between URL-derived tenant and session.user.organizationId
 * per .claude/rules/security.md §TENANT MIDDLEWARE SAFETY.
 * Super-admin bypass allowed.
 */

import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { authConfig } from "@/server/auth.config";

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

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  const session = req.auth;

  // Redirect unauthenticated users attempting protected routes to login
  if (isProtected && !session?.user) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set(
      "callbackUrl",
      nextUrl.pathname + nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0] ?? "";
  const tenantSlug = extractTenantSlug(hostname, path);

  // Attach enriched headers for tRPC context and route handlers
  // Tenant-session cross-check (slug→organizationId) deferred to tRPC procedures
  // to avoid per-request DB lookup in Edge middleware. See TODO below.
  const requestHeaders = new Headers(req.headers);

  if (tenantSlug) {
    requestHeaders.set("x-tenant-slug", tenantSlug);
  }

  if (session?.user) {
    requestHeaders.set("x-user-id", session.user.id);
    // organizationId may be absent for super-admins operating outside a tenant
    if (session.user.organizationId) {
      requestHeaders.set("x-organization-id", session.user.organizationId);
    }
    // TODO Part 5b+: add org slug to JWT so middleware can enforce slug→organizationId
    // match without a DB lookup, enabling full §TENANT MIDDLEWARE SAFETY enforcement here.
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
