import { platformPrisma, writeAuditLog, type AuditLogWriter } from '@yelli/db';
import { Worker, type Job } from 'bullmq';

import { getRedisConnection } from '../connection';
import { QUEUE_NAMES, type LiveKitEgressWebhookJob } from '../queues';

/**
 * Worker for the livekit-egress-webhook queue (Phase 8 Batch B sub-3).
 *
 * Concurrency: 2 — recordings finish independently, no shared row contention.
 * Retry: 3 attempts per defaultJobOptions — the worker is idempotent so
 * transient blips can safely re-run.
 *
 * ─── Idempotency ───
 * Two layers:
 *   (1) Queue layer — route handler attaches `jobId: livekit-egress-{event_id}`
 *       so LiveKit retries are absorbed by BullMQ before the worker even runs.
 *   (2) DB layer — the handler short-circuits when the Recording row is
 *       already in the target terminal state (ready / failed). Re-runs of
 *       a terminal-event job are no-ops, never double-mutations.
 *
 * ─── Tenant resolution ───
 * Webhook intake has no session — the LiveKitEgressWebhookJob is NOT a
 * TenantJobBase. We resolve the organization by `egress_id` lookup on the
 * Recording row (unique). The Recording row's organization_id is the
 * authoritative tenant context for all downstream writes (AuditLog,
 * Meeting update).
 *
 * ─── Egress event types we care about ───
 *   egress_started  → no-op (Recording already 'processing' from start mutation)
 *   egress_updated  → no-op (intermediate progress)
 *   egress_ended    → status='ready', set file_size_bytes + duration_seconds,
 *                     Meeting.recording_enabled=false
 *   egress_failed   → status='failed', Meeting.recording_enabled=false
 *
 * The LiveKit `status` field on egress_ended is overloaded — it carries
 * EGRESS_COMPLETE for success and EGRESS_FAILED for failure. The handler
 * inspects both event_type AND status to disambiguate.
 */

// ─── Public job-result shape (for tests + observability) ───
export type LiveKitEgressWebhookJobResult =
  | { status: 'recording_not_found'; egress_id: string }
  | { status: 'no_op'; event_type: string; egress_id: string }
  | { status: 'already_ready'; egress_id: string }
  | { status: 'already_failed'; egress_id: string }
  | {
      status: 'ready';
      recording_id: string;
      file_size_bytes: string;
      duration_seconds: number;
    }
  | { status: 'failed'; recording_id: string; error_message: string | null };

// ─── Minimal Prisma surface the handler depends on ───
// Mirrors xendit-webhook.ts: declaring only the methods we touch makes
// the handler testable with vi.fn() stubs (no full Prisma client mock).
export interface LiveKitEgressWebhookPrismaClient extends AuditLogWriter {
  recording: {
    findUnique: (args: {
      where: { egress_id: string };
    }) => Promise<{
      id: string;
      organization_id: string;
      meeting_id: string;
      status: string;
    } | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  meeting: {
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  $transaction: <T>(
    fn: (tx: LiveKitEgressWebhookPrismaClient) => Promise<T>,
  ) => Promise<T>;
}

export interface LiveKitEgressWebhookHandlerDeps {
  prisma: LiveKitEgressWebhookPrismaClient;
  writeAuditLog: typeof writeAuditLog;
}

const TERMINAL_SUCCESS_EVENTS = new Set(['egress_ended']);
const TERMINAL_FAILURE_EVENTS = new Set(['egress_failed']);

function isFailureStatus(status: string): boolean {
  // LiveKit status enum names — when egress_ended carries EGRESS_FAILED we
  // treat the run as failed even though the event_type says "ended".
  return /FAILED|ABORTED|LIMIT_REACHED/i.test(status);
}

/**
 * Pure handler — separate from the BullMQ wrapper so tests can drive it
 * synchronously with stubbed deps.
 */
export async function processLiveKitEgressWebhookJob(
  job: LiveKitEgressWebhookJob,
  deps: LiveKitEgressWebhookHandlerDeps,
): Promise<LiveKitEgressWebhookJobResult> {
  const recording = await deps.prisma.recording.findUnique({
    where: { egress_id: job.egress_id },
  });

  if (!recording) {
    // Recording may have been hard-deleted, or this egress was kicked off
    // outside the app (manual livekit-cli). Either way: nothing to do.
    // Returning success acks the job — LiveKit won't retry.
    return { status: 'recording_not_found', egress_id: job.egress_id };
  }

  const treatAsFailure =
    TERMINAL_FAILURE_EVENTS.has(job.event_type) ||
    (TERMINAL_SUCCESS_EVENTS.has(job.event_type) && isFailureStatus(job.status));

  // Non-terminal events (egress_started, egress_updated) — no DB change.
  if (
    !TERMINAL_SUCCESS_EVENTS.has(job.event_type) &&
    !TERMINAL_FAILURE_EVENTS.has(job.event_type)
  ) {
    return {
      status: 'no_op',
      event_type: job.event_type,
      egress_id: job.egress_id,
    };
  }

  // Terminal failure path.
  if (treatAsFailure) {
    if (recording.status === 'failed') {
      return { status: 'already_failed', egress_id: job.egress_id };
    }
    await deps.prisma.$transaction(async (tx) => {
      await tx.recording.update({
        where: { id: recording.id },
        data: { status: 'failed' },
      });
      await tx.meeting.update({
        where: { id: recording.meeting_id },
        data: { recording_enabled: false },
      });
      await deps.writeAuditLog(tx, {
        organizationId: recording.organization_id,
        userId: null,
        action: 'UPDATE',
        entity: 'Recording',
        entityId: recording.id,
        before: { status: recording.status },
        after: {
          status: 'failed',
          error_message: job.error_message,
          egress_status: job.status,
        },
      });
    });
    return {
      status: 'failed',
      recording_id: recording.id,
      error_message: job.error_message,
    };
  }

  // Terminal success path (egress_ended with non-failure status).
  if (recording.status === 'ready') {
    return { status: 'already_ready', egress_id: job.egress_id };
  }

  await deps.prisma.$transaction(async (tx) => {
    await tx.recording.update({
      where: { id: recording.id },
      data: {
        status: 'ready',
        file_size_bytes: BigInt(job.file_size_bytes),
        duration_seconds: job.duration_seconds,
      },
    });
    await tx.meeting.update({
      where: { id: recording.meeting_id },
      data: { recording_enabled: false },
    });
    await deps.writeAuditLog(tx, {
      organizationId: recording.organization_id,
      userId: null,
      action: 'UPDATE',
      entity: 'Recording',
      entityId: recording.id,
      before: { status: recording.status },
      after: {
        status: 'ready',
        file_size_bytes: job.file_size_bytes,
        duration_seconds: job.duration_seconds,
      },
    });
  });

  return {
    status: 'ready',
    recording_id: recording.id,
    file_size_bytes: job.file_size_bytes,
    duration_seconds: job.duration_seconds,
  };
}

export function createLiveKitEgressWebhookWorker(): Worker<LiveKitEgressWebhookJob> {
  const worker = new Worker<LiveKitEgressWebhookJob>(
    QUEUE_NAMES.livekitEgressWebhook,
    async (job: Job<LiveKitEgressWebhookJob>) => {
      // platformPrisma — webhook intake has no tenant; we resolve org from
      // the Recording row's organization_id (unique on egress_id).
      return processLiveKitEgressWebhookJob(job.data, {
        prisma:
          platformPrisma as unknown as LiveKitEgressWebhookPrismaClient,
        writeAuditLog,
      });
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[livekit-egress-webhook] Job ${job?.id ?? 'unknown'} failed:`,
      err.message,
    );
  });

  return worker;
}
