"use client";

import { cn } from "@yelli/ui";
import {
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/departments", label: "Departments", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

interface AdminSidebarProps {
  isSuperAdmin: boolean;
  displayName: string;
}

/**
 * Admin sidebar — dark surface per DESIGN.md ("Sidebar is the only dark surface").
 * Renders on every /admin/* route via apps/web/src/app/admin/layout.tsx.
 * Includes a Super Admin shortcut when the active user has platform privilege.
 */
export function AdminSidebar({
  isSuperAdmin,
  displayName,
}: AdminSidebarProps): JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-white/10 px-6 py-5">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            Y
          </span>
          <span>Yelli Admin</span>
        </Link>
        <p className="mt-2 truncate text-xs text-white/60">
          Signed in as {displayName}
        </p>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/75 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {isSuperAdmin && (
        <div className="border-t border-white/10 px-3 py-3">
          <Link
            href="/superadmin"
            className="flex items-center gap-3 rounded-md bg-accent/15 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/25"
          >
            <span aria-hidden>⚡</span>
            Super Admin
          </Link>
        </div>
      )}

      <div className="border-t border-white/10 px-6 py-4">
        <Link
          href="/app"
          className="text-xs text-white/60 hover:text-white/90"
        >
          ← Back to app
        </Link>
      </div>
    </aside>
  );
}
