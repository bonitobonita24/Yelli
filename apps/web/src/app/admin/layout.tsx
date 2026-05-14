import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { auth } from "@/server/auth";

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
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin");
  }

  const { role, isSuperAdmin, displayName } = session.user;

  if (role !== "tenant_admin" && !isSuperAdmin) {
    redirect("/app");
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
