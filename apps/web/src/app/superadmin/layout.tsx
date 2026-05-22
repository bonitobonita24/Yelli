import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { buildTenantBouncePath } from "@/server/tenant-redirect";

/**
 * /superadmin/* layout — RSC platform-privilege guard.
 *
 * Per security.md §SUPERADMIN AND PLATFORM-LEVEL ROLES:
 *   - Access requires session.user.isSuperAdmin === true.
 *   - The session callback in auth.ts validates security_version on every
 *     read, so a demoted account cannot reach this layout with a stale token.
 *   - Non-platform users are redirected (not 403'd) — UX-friendly and matches
 *     the auth-enumeration-resistant pattern elsewhere in the app.
 *
 * The sidebar is intentionally simpler than /admin/* — super-admin is a small
 * surface with only Organizations + Platform Settings.
 *
 * (admin-bounce-prefix-symmetry): bounces route via buildTenantBouncePath so
 * the `/t/{slug}` URL prefix is preserved on the path-pattern dev route.
 */
export default async function SuperAdminLayout({
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
      buildTenantBouncePath("/login?callbackUrl=/superadmin", tenantPathPrefix),
    );
  }
  if (!session.user.isSuperAdmin) {
    redirect(buildTenantBouncePath("/app", tenantPathPrefix));
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/superadmin" className="font-semibold">
              <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
                Y
              </span>
              Yelli Platform
            </Link>
            <nav className="flex items-center gap-4 text-sm text-white/75">
              <Link href="/superadmin" className="hover:text-white">
                Organizations
              </Link>
              <Link
                href="/superadmin/platform-settings"
                className="hover:text-white"
              >
                Platform settings
              </Link>
            </nav>
          </div>
          <Link
            href="/admin"
            className="text-xs text-white/60 hover:text-white/90"
          >
            ← Back to admin
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
