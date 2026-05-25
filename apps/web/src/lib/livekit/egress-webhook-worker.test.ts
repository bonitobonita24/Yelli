// LOCATION NOTE: This test lives in apps/web (not packages/jobs) because
// apps/web is the only workspace with vitest configured — same pattern
// as xendit's webhook-worker.test.ts. The handler is exported from
// @yelli/jobs so the cross-workspace import works cleanly.
import {
  processLiveKitEgressWebhookJob,
  type LiveKitEgressWebhookHandlerDeps,
  type LiveKitEgressWebhookJob,
  type LiveKitEgressWebhookJobResult,
  type LiveKitEgressWebhookPrismaClient,
} from '@yelli/jobs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Touch the imported result type so it doesn't drop from the import statement.
type _Unused = LiveKitEgressWebhookJobResult;

function makeJob(
  overrides: Partial<LiveKitEgressWebhookJob> = {},
): LiveKitEgressWebhookJob {
  return {
    event_id: 'EV_test_id',
    event_type: 'egress_ended',
    egress_id: 'EG_abc',
    room_name: 'room-1',
    status: 'EGRESS_COMPLETE',
    file_size_bytes: '1048576',
    duration_seconds: 60,
    error_message: null,
    received_at: '2026-05-26T07:00:00.000Z',
    ...overrides,
  };
}

function makeDeps(
  recording: {
    id: string;
    organization_id: string;
    meeting_id: string;
    status: string;
  } | null,
): {
  deps: LiveKitEgressWebhookHandlerDeps;
  recordingUpdate: ReturnType<typeof vi.fn>;
  meetingUpdate: ReturnType<typeof vi.fn>;
  auditLog: ReturnType<typeof vi.fn>;
} {
  const recordingUpdate = vi.fn().mockResolvedValue(undefined);
  const meetingUpdate = vi.fn().mockResolvedValue(undefined);
  const auditLogCreate = vi.fn().mockResolvedValue(undefined);
  const auditLog = vi.fn().mockResolvedValue(undefined);

  const tx: LiveKitEgressWebhookPrismaClient = {
    recording: {
      findUnique: vi.fn().mockResolvedValue(recording),
      update: recordingUpdate,
    },
    meeting: { update: meetingUpdate },
    auditLog: { create: auditLogCreate },
    $transaction: vi.fn(async (fn) => fn(tx)),
  };

  return {
    deps: {
      prisma: tx,
      writeAuditLog: auditLog as unknown as LiveKitEgressWebhookHandlerDeps['writeAuditLog'],
    },
    recordingUpdate,
    meetingUpdate,
    auditLog,
  };
}

describe('processLiveKitEgressWebhookJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns recording_not_found and no-ops when egress_id is unknown', async () => {
    const { deps, recordingUpdate, meetingUpdate, auditLog } = makeDeps(null);
    const res = await processLiveKitEgressWebhookJob(makeJob(), deps);
    expect(res).toEqual({ status: 'recording_not_found', egress_id: 'EG_abc' });
    expect(recordingUpdate).not.toHaveBeenCalled();
    expect(meetingUpdate).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('returns no_op for egress_started without mutating', async () => {
    const { deps, recordingUpdate } = makeDeps({
      id: 'rec1',
      organization_id: 'org1',
      meeting_id: 'm1',
      status: 'processing',
    });
    const res = await processLiveKitEgressWebhookJob(
      makeJob({ event_type: 'egress_started', status: 'EGRESS_STARTING' }),
      deps,
    );
    expect(res).toEqual({
      status: 'no_op',
      event_type: 'egress_started',
      egress_id: 'EG_abc',
    });
    expect(recordingUpdate).not.toHaveBeenCalled();
  });

  it('happy path egress_ended: status=ready, file_size + duration, audit logged', async () => {
    const { deps, recordingUpdate, meetingUpdate, auditLog } = makeDeps({
      id: 'rec1',
      organization_id: 'org1',
      meeting_id: 'm1',
      status: 'processing',
    });
    const res = await processLiveKitEgressWebhookJob(makeJob(), deps);
    expect(res).toEqual({
      status: 'ready',
      recording_id: 'rec1',
      file_size_bytes: '1048576',
      duration_seconds: 60,
    });
    expect(recordingUpdate).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: {
        status: 'ready',
        file_size_bytes: BigInt(1048576),
        duration_seconds: 60,
      },
    });
    expect(meetingUpdate).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { recording_enabled: false },
    });
    expect(auditLog).toHaveBeenCalledOnce();
  });

  it('idempotent: already_ready when Recording is already ready', async () => {
    const { deps, recordingUpdate } = makeDeps({
      id: 'rec1',
      organization_id: 'org1',
      meeting_id: 'm1',
      status: 'ready',
    });
    const res = await processLiveKitEgressWebhookJob(makeJob(), deps);
    expect(res).toEqual({ status: 'already_ready', egress_id: 'EG_abc' });
    expect(recordingUpdate).not.toHaveBeenCalled();
  });

  it('egress_failed: status=failed, error_message captured', async () => {
    const { deps, recordingUpdate, auditLog } = makeDeps({
      id: 'rec1',
      organization_id: 'org1',
      meeting_id: 'm1',
      status: 'processing',
    });
    const res = await processLiveKitEgressWebhookJob(
      makeJob({
        event_type: 'egress_failed',
        status: 'EGRESS_FAILED',
        error_message: 'storage unreachable',
      }),
      deps,
    );
    expect(res).toEqual({
      status: 'failed',
      recording_id: 'rec1',
      error_message: 'storage unreachable',
    });
    expect(recordingUpdate).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: { status: 'failed' },
    });
    expect(auditLog).toHaveBeenCalledOnce();
  });

  it('treats egress_ended with EGRESS_FAILED status as failure', async () => {
    const { deps, recordingUpdate } = makeDeps({
      id: 'rec1',
      organization_id: 'org1',
      meeting_id: 'm1',
      status: 'processing',
    });
    const res = await processLiveKitEgressWebhookJob(
      makeJob({ event_type: 'egress_ended', status: 'EGRESS_FAILED' }),
      deps,
    );
    expect(res).toMatchObject({ status: 'failed' });
    expect(recordingUpdate).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: { status: 'failed' },
    });
  });

  it('idempotent: already_failed when Recording is already failed', async () => {
    const { deps, recordingUpdate } = makeDeps({
      id: 'rec1',
      organization_id: 'org1',
      meeting_id: 'm1',
      status: 'failed',
    });
    const res = await processLiveKitEgressWebhookJob(
      makeJob({ event_type: 'egress_failed', status: 'EGRESS_FAILED' }),
      deps,
    );
    expect(res).toEqual({ status: 'already_failed', egress_id: 'EG_abc' });
    expect(recordingUpdate).not.toHaveBeenCalled();
  });
});
