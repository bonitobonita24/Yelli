import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { IntercomCall } from "@/components/call/intercom-call-loader";
import { auth } from "@/server/auth";
import { buildTenantBouncePath } from "@/server/tenant-redirect";

interface CallPageProps {
  params: Promise<{ id: string }>;
}

export default async function CallPage({ params }: CallPageProps) {
  const { id } = await params;

  const session = await auth();
  const requestHeaders = await headers();
  const tenantPathPrefix =
    requestHeaders.get("x-tenant-path-prefix") ?? "";

  if (!session?.user?.id) {
    redirect(buildTenantBouncePath("/login", tenantPathPrefix));
  }

  // (admin-bounce-prefix-symmetry): invalid callId bounces back to the speed
  // dial. Preserve the /t/{slug} URL prefix on the path-pattern dev route.
  if (!id || id.length > 128) {
    redirect(buildTenantBouncePath("/app", tenantPathPrefix));
  }

  const displayName =
    session.user.name ?? session.user.email ?? "User";

  return (
    <div className="fixed inset-0 bg-background">
      <IntercomCall callId={id} displayName={displayName} />
    </div>
  );
}
