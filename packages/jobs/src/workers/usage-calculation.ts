import { Worker } from 'bullmq';

import { getRedisConnection } from '../connection';
import { QUEUE_NAMES, type UsageCalculationJob } from '../queues';

import { validateTenantJob } from './_validate';

/**
 * Worker for the usage-calculation queue.
 * Concurrency: 1 — sequential to avoid double-counting usage across tenants.
 *
 * CRON SENTINEL HANDLING (security.md Queue Safety rule 7):
 * Cron-fired jobs carry an empty organizationId sentinel ("") — this is intentional.
 * Workers MUST NOT call validateTenantJob for cron jobs; instead they iterate ALL
 * active tenants and process each one with its own organizationId-scoped query.
 *
 * Regular enqueued jobs (organizationId non-empty) represent single-tenant recalculations
 * and DO call validateTenantJob.
 */
export function createUsageCalculationWorker(): Worker<UsageCalculationJob> {
  const worker = new Worker<UsageCalculationJob>(
    QUEUE_NAMES.usageCalculation,
    async (job) => {
      const isCronSentinel = job.data.organizationId === '';

      if (isCronSentinel) {
        // CRON PATH — iterate all active tenants (security.md Queue Safety rule 4 + 7).
        // TODO (Phase 7): Replace with real tenant iteration.
        //   const tenants = await platformPrisma.organization.findMany({ where: { isActive: true } });
        //   for (const tenant of tenants) {
        //     await calculateUsageForTenant(tenant.id, cycleStart, cycleEnd);
        //     // Write AuditLog with action "PLATFORM:USAGE_CALCULATION" per tenant.
        //   }
        return { mode: 'cron', status: 'placeholder' };
      }

      // SINGLE-TENANT PATH — enqueued explicitly for one tenant.
      validateTenantJob(job);

      const { organizationId, cycleStart, cycleEnd } = job.data;

      // TODO (Phase 7): Implement single-tenant usage calculation.
      // Steps:
      //   1. Aggregate call minutes, recordings stored, active seats for this billing cycle.
      //   2. Upsert UsageSummary record scoped to organizationId.
      //   3. Write AuditLog entry scoped to organizationId.

      return { organizationId, cycleStart, cycleEnd, status: 'placeholder' };
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[usage-calculation] Job ${job?.id ?? 'unknown'} failed on queue ${QUEUE_NAMES.usageCalculation}:`,
      err.message,
    );
  });

  return worker;
}
