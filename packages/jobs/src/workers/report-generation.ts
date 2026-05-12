import { Worker } from 'bullmq';

import { getRedisConnection } from '../connection';
import { QUEUE_NAMES, type ReportGenerationJob } from '../queues';

import { validateTenantJob } from './_validate';

/**
 * Worker for the report-generation queue.
 * Concurrency: 1 — report generation is CPU/DB intensive; serial per instance.
 *
 * Security: validateTenantJob is called first to reject any job missing organizationId.
 * Payload contains only IDs and range metadata — no PII, no credentials.
 * All DB queries inside the worker are scoped to job.data.organizationId.
 */
export function createReportGenerationWorker(): Worker<ReportGenerationJob> {
  const worker = new Worker<ReportGenerationJob>(
    QUEUE_NAMES.reportGeneration,
    async (job) => {
      validateTenantJob(job);

      const { reportType, rangeStart, rangeEnd, format, organizationId } = job.data;

      // TODO (Phase 7): Implement report generation.
      // Steps:
      //   1. Fetch aggregated data from DB scoped to organizationId + date range.
      //   2. Build the report payload (CSV rows or PDF template data).
      //   3. Render the report (csv-stringify or pdf-lib / pdfmake).
      //   4. Upload output to MinIO/S3 under:
      //      keys.buildStorageKey(organizationId, 'reports', `${reportType}-${rangeStart}.${format}`)
      //   5. Create a Report record in DB (organizationId-scoped) pointing at the storage key.
      //   6. Write AuditLog entry.
      //   7. Emit notification to requesting user (userId from job.data).

      return { reportType, rangeStart, rangeEnd, format, organizationId, status: 'placeholder' };
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[report-generation] Job ${job?.id ?? 'unknown'} failed on queue ${QUEUE_NAMES.reportGeneration}:`,
      err.message,
    );
  });

  return worker;
}
