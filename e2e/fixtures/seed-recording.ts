import { platformPrisma } from "@yelli/db";

export interface SeededRecording {
  id: string;
  egressId: string;
  meetingId: string;
  callLogId: string;
  cleanup: () => Promise<void>;
}

/**
 * Seeds a fully-formed Recording row directly via Prisma, bypassing the
 * tRPC recordings.start/stop flow. Used by the soft-delete e2e spec (b)
 * which needs ONE pre-existing Recording row to soft-delete via the UI.
 *
 * Why direct Prisma (not tRPC):
 *   `recordings.start` requires an active CallLog (ended_at: null) for the
 *   meeting. The codebase has no tRPC procedure that creates an OPEN CallLog
 *   — production writes a closed CallLog only at meeting end. For e2e we
 *   synthesize the full chain (Meeting → CallLog → Recording) atomically.
 *
 * Uses platformPrisma (no L6 tenant guard) since the Playwright runner
 * process has no tenant session. Webmaster's user record provides the
 * organization_id + user_id needed for FK satisfaction.
 */
export async function seedRecording(opts?: {
  webmasterUsername?: string;
  status?: "processing" | "ready" | "failed" | "deleted";
}): Promise<SeededRecording> {
  const usernameOrPrefix = opts?.webmasterUsername ?? "webmaster";
  const status = opts?.status ?? "ready";

  const webmaster = await platformPrisma.user.findFirst({
    where: {
      OR: [
        { email: { startsWith: `${usernameOrPrefix}@` } },
        { display_name: usernameOrPrefix },
      ],
    },
    select: { id: true, organization_id: true },
  });

  if (!webmaster) {
    throw new Error(
      `seedRecording: webmaster user not found. Did 'pnpm db:seed' run? Looked for email LIKE "${usernameOrPrefix}@%" or display_name="${usernameOrPrefix}".`,
    );
  }

  const orgId = webmaster.organization_id;
  const userId = webmaster.id;
  const now = new Date();
  const suffix = `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  const egressId = `e2e-mock-seeded-${suffix}`;

  const recording = await platformPrisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        organization_id: orgId,
        host_user_id: userId,
        title: `E2E seeded recording ${now.toISOString()}`,
        meeting_link_token: `e2e-${suffix}`,
        livekit_room_name: `e2e-room-${suffix}`,
        status: "ended",
        started_at: now,
        ended_at: now,
        recording_enabled: true,
      },
      select: { id: true },
    });

    const callLog = await tx.callLog.create({
      data: {
        organization_id: orgId,
        meeting_id: meeting.id,
        caller_user_id: userId,
        call_type: "meeting",
        started_at: now,
        ended_at: now,
        participant_count: 1,
        status: "completed",
      },
      select: { id: true },
    });

    const rec = await tx.recording.create({
      data: {
        organization_id: orgId,
        meeting_id: meeting.id,
        call_log_id: callLog.id,
        recorded_by_user_id: userId,
        file_path: `${orgId}/recordings/${egressId}.mp4`,
        status,
        egress_id: egressId,
      },
      select: { id: true, meeting_id: true, call_log_id: true },
    });

    return rec;
  });

  return {
    id: recording.id,
    egressId,
    meetingId: recording.meeting_id,
    callLogId: recording.call_log_id,
    cleanup: async () => {
      // Delete in dependency-safe order. Each wrapped in try/catch in case
      // the test already deleted (or cascaded) the row.
      try {
        await platformPrisma.recording.delete({ where: { id: recording.id } });
      } catch {
        // already deleted
      }
      try {
        await platformPrisma.callLog.delete({ where: { id: recording.call_log_id } });
      } catch {
        // already deleted
      }
      try {
        await platformPrisma.meeting.delete({ where: { id: recording.meeting_id } });
      } catch {
        // already deleted
      }
    },
  };
}
