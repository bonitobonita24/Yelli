import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PastDueBanner } from "@/components/billing/past-due-banner";
import { IncomingCallDialog } from "@/components/call/incoming-call-dialog";
import { SocketProvider } from "@/lib/socket/socket-context";
import { auth } from "@/server/auth";
import { isGuestBypassFromHeaders } from "@/server/guest-bypass";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // (guest-meeting-layout-bypass): the middleware (apps/web/src/middleware.ts)
  // sets `x-yelli-guest-bypass: 1` when a request matches the exact-shape
  // guest URL `/app/meeting/{id}?guest=1`. For those requests the layout MUST
  // skip its own auth() gate AND skip wrapping the page in <SocketProvider> +
  // <IncomingCallDialog> — those are host-only concerns (the SocketProvider
  // opens an authenticated socket.io connection which guests can't use).
  // Page-level validation (sessionStorage credentials in
  // <GuestMeetingRoomLoader>) is the primary defense; LiveKit JWT is the
  // cryptographic credential. See @/server/guest-bypass for the helper
  // contract.
  const requestHeaders = await headers();
  if (isGuestBypassFromHeaders(requestHeaders)) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SocketProvider>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-6 pt-4">
          <PastDueBanner />
        </div>
        {children}
        <IncomingCallDialog />
      </div>
    </SocketProvider>
  );
}
