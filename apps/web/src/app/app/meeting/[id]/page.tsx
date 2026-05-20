import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";

import { GuestMeetingRoomLoader } from "@/components/meeting/guest-meeting-room-loader";
import { MeetingRoom } from "@/components/meeting/meeting-room-loader";
import { createServerCaller } from "@/lib/trpc/server";
import { auth } from "@/server/auth";

import type { Metadata } from "next";

interface MeetingPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: MeetingPageProps): Promise<Metadata> {
  const { id } = await params;
  // CUID v1 format used by the schema — keep this loose, real validation
  // happens in the tRPC procedure below.
  if (id.length > 64) return { title: "Meeting — Yelli" };
  try {
    const caller = await createServerCaller();
    const meeting = await caller.meetings.byId({ id });
    return { title: `${meeting.title} — Yelli` };
  } catch {
    return { title: "Meeting — Yelli" };
  }
}

export default async function MeetingPage({
  params,
  searchParams,
}: MeetingPageProps) {
  const { id } = await params;
  const search = await searchParams;

  if (id.length > 64) {
    notFound();
  }

  // (guest-meeting-page-render): the middleware bypass (see
  // @/server/guest-bypass) lets `/app/meeting/{id}?guest=1` through
  // without a session. Skip auth() + the protected tRPC call and
  // render the guest loader, which validates sessionStorage
  // credentials client-side. The LiveKit JWT (minted by
  // meetings.exchangeGuestToken) is the actual credential.
  if (search.guest === "1") {
    return (
      <div className="fixed inset-0 bg-background">
        <GuestMeetingRoomLoader meetingId={id} />
      </div>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  let meeting: { id: string; title: string; recording_enabled: boolean };
  try {
    const caller = await createServerCaller();
    const fetched = await caller.meetings.byId({ id });
    meeting = {
      id: fetched.id,
      title: fetched.title,
      recording_enabled: fetched.recording_enabled,
    };
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  return (
    <div className="fixed inset-0 bg-background">
      <MeetingRoom
        meetingId={meeting.id}
        title={meeting.title}
        recordingEnabled={meeting.recording_enabled}
      />
    </div>
  );
}
