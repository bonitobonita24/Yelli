// Phase 8 Item 3 sub-session 3c-ii-b: grace-period suspension cron.
//
// Scans Subscription rows where status='past_due' AND grace_period_end <= now
// and transitions each to 'suspended' (with plan_tier downgrade to 'free',
// Organization.suspended_at + subscription_status sync, and a
// PLATFORM:GRACE_PERIOD_EXPIRED AuditLog entry).
//
// Triggered by the 'grace-sweeper:cron' scheduler (every 6 hours, see
// queues.ts registerCronJobs). The handler is pure — all I/O via injected
// deps — so the test file can drive every branch without Redis or Postgres.
//
// IDEMPOTENCY: the WHERE filter excludes already-suspended rows, so a
// re-run after a transient failure never double-suspends. Each row gets
// its own $transaction — partial failures abort that row only.

import {
  platformPrisma,
  writeAuditLog,
  type AuditLogWriter,
  type Prisma,
} from '@yelli/db';
import { Worker } from 'bullmq';

import { getRedisConnection } from '../connection';
import { QUEUE_NAMES, type GraceSweeperJob } from '../queues';

// ─── Grace-period configuration ────────────────────────────────
// Exported so xendit-webhook (invoice.expired) can set
// grace_period_end = now + GRACE_PERIOD_DAYS without duplicating the
// magic number. Locked at 7 days per PRODUCT.md billing flow spec
// (confirmed by Bonito 2026-05-24).
export const GRACE_PERIOD_DAYS = 7;

/**
 * Add `days` calendar days to `date`, returning a new Date.
 * UTC-safe (uses .getTime + ms arithmetic, no timezone drift on DST).
 * Exported for xendit-webhook + tests to share a single definition.
 */
export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// ─── Public job-result shape (for tests + observability) ───────
export type GraceSweeperJobResult = {
  mode: 'cron';
  scanned: number;     // rows matched by the past_due + grace_end<=now filter
  suspended: number;   // rows successfully transitioned to suspended
  failed: number;      // rows whose $transaction threw (worker keeps going)
};

// ─── Minimal Prisma surface the handler depends on ─────────────
// Mirrors xendit-webhook.ts pattern — declaring only what we touch
// lets the test file inject vi.fn() stubs without a full client mock.
export interface GraceSweeperPrismaClient extends AuditLogWriter {
  subscription: {
    findMany: (args: {
      where: {
        status: 'past_due';
        grace_period_end: { lte: Date; not: null };
      };
      select: {
        id: true;
        organization_id: true;
        plan_tier: true;
        status: true;
        grace_period_end: true;
      };
    }) => Promise<Array<{
      id: string;
      organization_id: string;
      plan_tier: string;
      status: string;
      grace_period_end: Date | null;
    }>>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  organization: {
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  $transaction: <T>(fn: (tx: GraceSweeperPrismaClient) => Promise<T>) => Promise<T>;
}

// Dependency-injection shape for the pure handler. Production wires
// platformPrisma + writeAuditLog; tests wire vi.fn() stubs.
export interface GraceSweeperHandlerDeps {
  prisma: GraceSweeperPrismaClient;
  writeAuditLog: typeof writeAuditLog;
  now?: () => Date; // injectable for deterministic test timestamps
}

// ─── Pure handler — testable unit ──────────────────────────────
/**
 * Scan + suspend eligible Subscriptions. Pure function — all I/O
 * happens via injected deps.
 *
 * NEVER throws on per-row failures: each row's $transaction is wrapped
 * in try/catch so a transient failure on one tenant doesn't stop the
 * sweep. The result.failed counter surfaces partials for observability.
 *
 * Only infrastructure failures on the initial findMany (DB unreachable)
 * bubble to BullMQ for retry.
 */
export async function processGraceSweeperJob(
  _data: GraceSweeperJob,
  deps: GraceSweeperHandlerDeps,
): Promise<GraceSweeperJobResult> {
  const { prisma, writeAuditLog: writeAudit, now = () => new Date() } = deps;
  const nowDate = now();

  const eligible = await prisma.subscription.findMany({
    where: {
      status: 'past_due',
      grace_period_end: { lte: nowDate, not: null },
    },
    select: {
      id: true,
      organization_id: true,
      plan_tier: true,
      status: true,
      grace_period_end: true,
    },
  });

  let suspendedCount = 0;
  let failedCount = 0;

  for (const sub of eligible) {
    // Per security.md Queue Safety rule 4 + 7: cron jobs iterate tenants
    // explicitly; each iteration scoped to one organization_id.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: 'suspended' },
        });
        await tx.organization.update({
          where: { id: sub.organization_id },
          data: {
            subscription_status: 'suspended',
            plan_tier: 'free',
            suspended_at: nowDate,
          },
        });
        await writeAudit(tx, {
          organizationId: sub.organization_id,
          userId: null,
          action: 'PLATFORM:GRACE_PERIOD_EXPIRED',
          entity: 'Subscription',
          entityId: sub.id,
          before: {
            status: sub.status,
            plan_tier: sub.plan_tier,
            grace_period_end: sub.grace_period_end?.toISOString() ?? null,
          } as Prisma.InputJsonValue,
          after: {
            status: 'suspended',
            plan_tier: 'free',
            suspended_at: nowDate.toISOString(),
          } as Prisma.InputJsonValue,
        });
      });
      suspendedCount++;
    } catch (err) {
      failedCount++;
      console.error(
        `[grace-sweeper] Suspension failed for subscription ${sub.id} (org ${sub.organization_id}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    mode: 'cron',
    scanned: eligible.length,
    suspended: suspendedCount,
    failed: failedCount,
  };
}

// ─── Worker factory ────────────────────────────────────────────
/**
 * Worker for the grace-sweeper queue.
 * Concurrency: 1 — sequential. The transactional per-row update is
 * already race-safe, but keeping concurrency at 1 makes failure logs
 * easier to follow and avoids piling pool connections during sweeps.
 *
 * Cron-only queue: every job is the registerCronJobs sentinel envelope.
 * No per-tenant validateTenantJob (per security.md rule 7).
 */
export function createGraceSweeperWorker(): Worker<GraceSweeperJob> {
  const worker = new Worker<GraceSweeperJob>(
    QUEUE_NAMES.graceSweeper,
    async (job) =>
      processGraceSweeperJob(job.data, {
        prisma: platformPrisma as unknown as GraceSweeperPrismaClient,
        writeAuditLog,
      }),
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[grace-sweeper] Job ${job?.id ?? 'unknown'} failed on queue ${QUEUE_NAMES.graceSweeper}:`,
      err.message,
    );
  });

  return worker;
}
