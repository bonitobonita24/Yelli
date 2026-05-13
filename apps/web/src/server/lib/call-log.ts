// Helper for persisting CallLog rows at call/meeting termination.
//
// All writes go through the L6 tenant-guarded prisma extension — organization_id
// is auto-injected at runtime. The Prisma.CallLogUncheckedCreateInput cast satisfies
// strict create input typing for the same reason (see meetings.ts create).
//
// Status enum: completed | missed | failed (security.md callLog enum).
// CallType enum: intercom | meeting.

import { prisma, type Prisma } from "@yelli/db";

interface RecordIntercomCallParams {
  organizationId: string;
  callerUserId: string;
  callerDepartmentId?: string | null;
  recipientDepartmentId?: string | null;
  startedAt: Date;
  endedAt: Date;
  participantCount: number;
  status: "completed" | "missed" | "failed";
}

interface RecordMeetingCallParams {
  organizationId: string;
  meetingId: string;
  callerUserId: string;
  startedAt: Date;
  endedAt: Date;
  participantCount: number;
  status: "completed" | "missed" | "failed";
}

export async function recordIntercomCallLog(
  params: RecordIntercomCallParams,
): Promise<{ id: string }> {
  const data: Prisma.CallLogUncheckedCreateInput = {
    organization_id: params.organizationId,
    meeting_id: null,
    caller_user_id: params.callerUserId,
    caller_department_id: params.callerDepartmentId ?? null,
    recipient_department_id: params.recipientDepartmentId ?? null,
    call_type: "intercom",
    started_at: params.startedAt,
    ended_at: params.endedAt,
    participant_count: params.participantCount,
    status: params.status,
  };

  const created = await prisma.callLog.create({
    data,
    select: { id: true },
  });
  return created;
}

export async function recordMeetingCallLog(
  params: RecordMeetingCallParams,
): Promise<{ id: string }> {
  const data: Prisma.CallLogUncheckedCreateInput = {
    organization_id: params.organizationId,
    meeting_id: params.meetingId,
    caller_user_id: params.callerUserId,
    caller_department_id: null,
    recipient_department_id: null,
    call_type: "meeting",
    started_at: params.startedAt,
    ended_at: params.endedAt,
    participant_count: params.participantCount,
    status: params.status,
  };

  const created = await prisma.callLog.create({
    data,
    select: { id: true },
  });
  return created;
}
