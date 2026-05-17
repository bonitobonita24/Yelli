import { redirect } from "next/navigation";

import { IncomingCallDialog } from "@/components/call/incoming-call-dialog";
import { SocketProvider } from "@/lib/socket/socket-context";
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
    <SocketProvider>
      <div className="min-h-screen bg-background">
        {children}
        <IncomingCallDialog />
      </div>
    </SocketProvider>
  );
}
