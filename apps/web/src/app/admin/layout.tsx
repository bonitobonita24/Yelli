import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { auth } from "@/server/auth";
import { buildTenantBouncePath } from "@/server/tenant-redirect";

/**
 * /admin/* layout — RSC auth + role gate.
 *
 * - Middleware already redirects unauthenticated requests to /login.
 * - Here we enforce role=tenant_admin OR is_super_admin=true.
 * - Non-admins are redirected to /app rather than shown a 403 page (UX-friendly,
 *   matches the auth-enumeration-resistant posture in the rest of the app).
 *
 * Super admins see an additional Super Admin shortcut in the sidebar (linking
 * to /superadmin/* which uses its own platformPrisma router stack).
 *
 * (admin-bounce-prefix-symmetry): bounces read `x-tenant-path-prefix` from
 * the middleware-attached headers and route the target via
 * `buildTenantBouncePath` so the `/t/{slug}` URL prefix is preserved when the
 * request arrived via that pattern (dev). Subdomain pattern (prod) carries
 * tenant context in hostname, so the prefix header is absent and the helper
 * returns the target unchanged.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> {
  const session = await auth();
  const requestHeaders = await headers();
  const tenantPathPrefix =
    requestHeaders.get("x-tenant-path-prefix") ?? "";

  if (!session?.user) {
    redirect(
      buildTenantBouncePath("/login?callbackUrl=/admin", tenantPathPrefix),
    );
  }

  const { role, isSuperAdmin, displayName } = session.user;

  if (role !== "tenant_admin" && !isSuperAdmin) {
    redirect(buildTenantBouncePath("/app", tenantPathPrefix));
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        isSuperAdmin={isSuperAdmin}
        displayName={displayName ?? "Admin"}
      />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
