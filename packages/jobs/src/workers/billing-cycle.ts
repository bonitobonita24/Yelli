import { Worker } from 'bullmq';

import { getRedisConnection } from '../connection';
import { QUEUE_NAMES, type BillingCycleJob } from '../queues';

import { validateTenantJob } from './_validate';

/**
 * Worker for the billing-cycle queue.
 * Concurrency: 1 — sequential to prevent duplicate invoice creation.
 * Retry: 5 attempts (highest — billing failures must self-heal before paging on-call).
 *
 * CRON SENTINEL HANDLING (security.md Queue Safety rule 7):
 * Cron-fired jobs carry an empty organizationId sentinel ("") — this is intentional.
 * Workers MUST NOT call validateTenantJob for cron jobs; instead they iterate ALL
 * active tenants in billing-due state and process each one independently.
 *
 * Regular enqueued jobs (organizationId non-empty) represent manual billing runs or
 * retry-from-DLQ for a single tenant and DO call validateTenantJob.
 *
 * IDEMPOTENCY: All writes must be idempotent — safe to retry on failure.
 * Use cycleDate + organizationId as the idempotency key on the Invoice table.
 */
export function createBillingCycleWorker(): Worker<BillingCycleJob> {
  const worker = new Worker<BillingCycleJob>(
    QUEUE_NAMES.billingCycle,
    async (job) => {
      const isCronSentinel = job.data.organizationId === '';

      if (isCronSentinel) {
        // CRON PATH — iterate all active tenants due for billing today.
        // TODO (Phase 7): Replace with real tenant iteration.
        //   const tenants = await platformPrisma.organization.findMany({
        //     where: { isActive: true, nextBillingDate: { lte: new Date(cycleDate) } },
        //   });
        //   for (const tenant of tenants) {
        //     await runBillingForTenant(tenant.id, cycleDate);
        //     // Each iteration: create Invoice, call Xendit Create Invoice API, write AuditLog.
        //     // Use upsert on (organizationId, cycleDate) for idempotency.
        //   }
        //
        // Xendit Invoice creation (security.md Xendit Webhook Security):
        //   - XENDIT_SECRET_KEY read from process.env['XENDIT_SECRET_KEY']
        //   - x-callback-token verified on incoming webhook (handled in Route Handler)
        //   - Webhook handler enqueues a follow-up job — never mutates state directly
        return { mode: 'cron', status: 'placeholder' };
      }

      // SINGLE-TENANT PATH — manual run or DLQ retry for one tenant.
      validateTenantJob(job);

      const { organizationId, cycleDate } = job.data;

      // TODO (Phase 7): Implement single-tenant billing cycle.
      // Steps:
      //   1. Fetch usage summary for this cycleDate period scoped to organizationId.
      //   2. Upsert Invoice record (idempotency: unique on organizationId + cycleDate).
      //   3. Call Xendit Create Invoice API if invoice status is PENDING.
      //   4. Write AuditLog entry scoped to organizationId.

      return { organizationId, cycleDate, status: 'placeholder' };
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[billing-cycle] Job ${job?.id ?? 'unknown'} failed on queue ${QUEUE_NAMES.billingCycle}:`,
      err.message,
    );
  });

  return worker;
}
