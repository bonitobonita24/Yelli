import { Worker } from 'bullmq';

import { getRedisConnection } from '../connection';
import { QUEUE_NAMES, type RecordingProcessingJob } from '../queues';

import { validateTenantJob } from './_validate';

/**
 * Worker for the recording-processing queue.
 * Concurrency: 2 — allows up to 2 recordings to process simultaneously.
 *
 * Security: validateTenantJob is called first to reject any job missing organizationId.
 * Payload contains IDs only (recordingId, meetingId) — no PII, no tokens.
 * Full recording data is fetched inside the worker using the organizationId-scoped client.
 */
export function createRecordingProcessingWorker(): Worker<RecordingProcessingJob> {
  const worker = new Worker<RecordingProcessingJob>(
    QUEUE_NAMES.recordingProcessing,
    async (job) => {
      validateTenantJob(job);

      const { recordingId, meetingId, organizationId } = job.data;

      // TODO (Phase 7): Implement LiveKit Egress webhook handler.
      // Steps:
      //   1. Fetch recording metadata from DB scoped to organizationId.
      //   2. Trigger LiveKit Egress API (or read from egress webhook payload).
      //   3. Download the completed recording from LiveKit storage.
      //   4. Upload to MinIO/S3 under keys.buildStorageKey(organizationId, 'recordings', ext).
      //   5. Update recording status in DB (PROCESSING → READY or FAILED).
      //   6. Write AuditLog entry.
      //   7. Enqueue follow-up jobs (e.g. transcription) if declared in PRODUCT.md.

      return { recordingId, meetingId, organizationId, status: 'placeholder' };
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[recording-processing] Job ${job?.id ?? 'unknown'} failed on queue ${QUEUE_NAMES.recordingProcessing}:`,
      err.message,
    );
  });

  return worker;
}
