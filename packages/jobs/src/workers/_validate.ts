import { type Job } from 'bullmq';

import { type TenantJobBase } from '../queues';

/**
 * Validates that a job payload has a non-empty organizationId.
 * Per security.md Queue and Cache Safety rule 2: workers MUST validate
 * organizationId is a non-empty string before processing.
 * Throws — which BullMQ counts as a job failure and retries per queue config.
 */
export function validateTenantJob<T extends TenantJobBase>(job: Job<T>): void {
  if (!job.data?.organizationId || typeof job.data.organizationId !== 'string') {
    throw new Error(
      `Job ${job.id ?? 'unknown'} on queue ${job.queueName} rejected: missing or invalid organizationId. ` +
        `All tenant-scoped jobs MUST include organizationId (security.md Queue Safety rule 2).`,
    );
  }
}
