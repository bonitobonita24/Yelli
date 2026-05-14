import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";

import { MeetingRoom } from "@/components/meeting/meeting-room-loader";
import { createServerCaller } from "@/lib/trpc/server";
import { auth } from "@/server/auth";

import type { Metadata } from "next";

interface MeetingPageProps {
  params: Promise<{ id: string }>;
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

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (id.length > 64) {
    notFound();
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
