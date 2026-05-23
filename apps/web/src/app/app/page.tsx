// eslint-disable-next-line import/no-unresolved -- server-only is a virtual package resolved by Next.js
import "server-only";

// eslint-disable-next-line no-restricted-syntax -- Server component: direct DB access via platformPrisma is allowed here (Rule 13 — web app server component, not mobile)
import { platformPrisma } from "@yelli/db";
import { redirect } from "next/navigation";

import { PlanLimitBanner } from "@/components/plan-limit/usage-banner";
import { SpeedDialGrid } from "@/components/speed-dial/speed-dial-grid";
import { auth } from "@/server/auth";

export default async function AppPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const departments = await platformPrisma.department.findMany({
    where: { organization_id: session.user.organizationId },
    orderBy: [{ group_label: "asc" }, { sort_order: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      group_label: true,
      sort_order: true,
      auto_answer_enabled: true,
      default_user_id: true,
    },
  });

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Speed Dial
      </h1>
      {/* Banners render only at ≥80% — silent below threshold. Banner is a
          client component (uses tRPC hooks) so it streams in below the RSC
          shell. Tenant admins see actionable copy; participants see read-only
          informational state. */}
      <PlanLimitBanner feature="autoAnswerStations" />
      <PlanLimitBanner feature="departments" />
      <SpeedDialGrid
        departments={departments}
        userRole={session.user.role}
      />
    </main>
  );
}
