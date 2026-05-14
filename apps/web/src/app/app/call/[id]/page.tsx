import { redirect } from "next/navigation";

import { IntercomCall } from "@/components/call/intercom-call-loader";
import { auth } from "@/server/auth";

interface CallPageProps {
  params: Promise<{ id: string }>;
}

export default async function CallPage({ params }: CallPageProps) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Basic sanity check — callId must be a non-empty string up to 128 chars
  if (!id || id.length > 128) {
    redirect("/app");
  }

  const displayName =
    session.user.name ?? session.user.email ?? "User";

  return (
    <div className="fixed inset-0 bg-background">
      <IntercomCall callId={id} displayName={displayName} />
    </div>
  );
}
