import { redirect } from "next/navigation";

import { IncomingCallDialog } from "@/components/call/incoming-call-dialog";
import { auth } from "@/server/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      {children}
      <IncomingCallDialog />
    </div>
  );
}
