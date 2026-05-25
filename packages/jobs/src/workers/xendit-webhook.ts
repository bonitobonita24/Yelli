import {
  Prisma,
  platformPrisma,
  writeAuditLog,
  type AuditLogWriter,
} from '@yelli/db';
import { Worker, type Job } from 'bullmq';

import { getRedisConnection } from '../connection';
import { QUEUE_NAMES, type XenditWebhookJob } from '../queues';

import { GRACE_PERIOD_DAYS, addDaysUtc } from './grace-sweeper';

/**
 * Worker for the xendit-webhook queue (Phase 8 Item 3b-ii).
 *
 * Concurrency: 1 — sequential to prevent Subscription / Invoice
 * row-level race conditions when two retry deliveries of the same
 * event_id race the DB-level idempotency gate.
 *
 * Retry: 5 attempts per defaultJobOptions in queues.ts — payment
 * events must self-heal before paging on-call.
 *
 * ─── Idempotency (security.md Xendit Webhook Security rule 2) ───
 * Two-layer guard:
 *   (1) Queue layer — the route handler attaches `jobId: xendit-event-{event_id}`,
 *       so Xendit retries arriving before the worker drains are absorbed
 *       by BullMQ before the handler is even invoked.
 *   (2) DB layer — this worker INSERTs into ProcessedWebhookEvent on
 *       every job. A P2002 unique violation means the event was already
 *       processed (possibly by an earlier process / replica) and we
 *       return early without mutating Subscription or Invoice.
 *
 * ─── Payload integrity (security.md Xendit Webhook Security rule 3) ───
 * NEVER trust the webhook payload alone. Every state mutation is gated
 * on resolving the local Invoice row via `xendit_invoice_id` lookup
 * first — the payload only tells us "something happened with this
 * external_id"; our DB tells us what the something is _allowed_ to do.
 */

// ─── Provider constant (matches ProcessedWebhookEvent.provider) ───
const PROVIDER_XENDIT = 'xendit';

// ─── Supported Xendit event types ───
const EVENT_INVOICE_PAID = 'invoice.paid';
const EVENT_INVOICE_EXPIRED = 'invoice.expired';

// ─── Public job-result shape (for tests + observability) ───
export type XenditWebhookJobResult =
  | { status: 'duplicate'; event_id: string }
  | { status: 'invoice_not_found'; xendit_invoice_id: string }
  | { status: 'amount_mismatch'; xendit_invoice_id: string }
  | { status: 'unknown_event_type'; event_type: string }
  | { status: 'paid'; invoice_id: string; subscription_id: string }
  | { status: 'expired'; invoice_id: string; subscription_id: string };

// ─── Minimal Prisma surface the handler depends on ─────────────
// Declaring the exact methods we touch lets the test file stub them
// with vi.fn() and inject them — no full Prisma client mock needed.
// Mirrors AuditLogWriter's structural-typing pattern in @yelli/db.
export interface XenditWebhookPrismaClient extends AuditLogWriter {
  processedWebhookEvent: {
    create: (args: {
      data: {
        event_id: string;
        provider: string;
        event_type: string;
      };
    }) => Promise<unknown>;
  };
  invoice: {
    findUnique: (args: {
      where: { xendit_invoice_id: string };
    }) => Promise<{
      id: string;
      organization_id: string;
      subscription_id: string;
      amount_cents: number;
      status: string;
    } | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  subscription: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<{
      id: string;
      organization_id: string;
      status: string;
      current_period_start: Date;
      current_period_end: Date;
    } | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  $transaction: <T>(fn: (tx: XenditWebhookPrismaClient) => Promise<T>) => Promise<T>;
}

// Dependency-injection shape for the pure handler. Production wires
// platformPrisma + writeAuditLog; tests wire vi.fn() stubs.
export interface XenditWebhookHandlerDeps {
  prisma: XenditWebhookPrismaClient;
  writeAuditLog: typeof writeAuditLog;
  now?: () => Date; // injectable for deterministic test timestamps
}

// ─── Payload extraction (no trust — typed-guard each field) ───
function extractAmountCents(payload: Record<string, unknown>): number | null {
  const raw = payload['amount'];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  // Xendit invoice amounts arrive in MAJOR units (PHP, not centavos). We
  // store cents. Multiply + round to avoid float drift.
  return Math.round(raw * 100);
}

function extractPdfUrl(payload: Record<string, unknown>): string | null {
  const raw = payload['pdf_url'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

// ─── Pure handler — testable unit ──────────────────────────────
/**
 * Process a single Xendit webhook job. Pure function — all I/O
 * happens via the injected deps so tests can drive every branch
 * without spinning up Redis / Postgres.
 *
 * Returns a discriminated result. NEVER throws on business
 * conditions (duplicate, invoice-not-found, amount mismatch,
 * unknown event_type) — those are ack'd to keep Xendit from
 * pointlessly retrying. Only infrastructure failures (DB down,
 * unexpected Prisma errors) bubble up to BullMQ for retry.
 */
export async function processXenditWebhookJob(
  data: XenditWebhookJob,
  deps: XenditWebhookHandlerDeps,
): Promise<XenditWebhookJobResult> {
  const { prisma, writeAuditLog: writeAudit, now = () => new Date() } = deps;
  const { event_id, event_type, external_id, payload } = data;

  // ─── Step 1 — DB-level idempotency gate (security.md rule 2) ───
  // INSERT first; let the unique constraint on event_id reject duplicates
  // atomically. This is race-safe across multiple worker processes — the
  // queue-level jobId guard is best-effort, this is the real lock.
  try {
    await prisma.processedWebhookEvent.create({
      data: {
        event_id,
        provider: PROVIDER_XENDIT,
        event_type,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return { status: 'duplicate', event_id };
    }
    throw err;
  }

  // ─── Step 2 — Resolve the local Invoice row (security.md rule 3) ───
  // The webhook payload can claim anything; the Invoice row in our DB
  // is the source of truth for amount, currency, and ownership.
  const invoice = await prisma.invoice.findUnique({
    where: { xendit_invoice_id: external_id },
  });

  if (!invoice) {
    // No matching Invoice — could be a webhook for a different deployment,
    // a stale test event, or a payload-tampering attempt. Ack to drain it
    // from the retry queue; AuditLog at the platform level.
    await writeAudit(prisma, {
      organizationId: null,
      userId: null,
      action: 'PLATFORM:XENDIT_WEBHOOK_ORPHAN',
      entity: 'Invoice',
      entityId: external_id,
      before: null,
      after: { event_id, event_type } as Prisma.InputJsonValue,
    });
    return { status: 'invoice_not_found', xendit_invoice_id: external_id };
  }

  // ─── Step 3 — Dispatch by event_type ───
  switch (event_type) {
    case EVENT_INVOICE_PAID:
      return handleInvoicePaid({
        prisma,
        writeAudit,
        now,
        invoice,
        payload,
        event_id,
      });
    case EVENT_INVOICE_EXPIRED:
      return handleInvoiceExpired({
        prisma,
        writeAudit,
        now,
        invoice,
        event_id,
      });
    default:
      // Unknown event_type (Xendit may ship new events). Ack with a
      // platform-level AuditLog so we can spot the unhandled type in logs
      // without losing the webhook.
      await writeAudit(prisma, {
        organizationId: invoice.organization_id,
        userId: null,
        action: 'PLATFORM:XENDIT_WEBHOOK_UNHANDLED',
        entity: 'Invoice',
        entityId: invoice.id,
        before: null,
        after: { event_id, event_type } as Prisma.InputJsonValue,
      });
      return { status: 'unknown_event_type', event_type };
  }
}

// ─── invoice.paid handler ──────────────────────────────────────
interface PaidArgs {
  prisma: XenditWebhookPrismaClient;
  writeAudit: typeof writeAuditLog;
  now: () => Date;
  invoice: NonNullable<
    Awaited<ReturnType<XenditWebhookPrismaClient['invoice']['findUnique']>>
  >;
  payload: Record<string, unknown>;
  event_id: string;
}

async function handleInvoicePaid(
  args: PaidArgs,
): Promise<XenditWebhookJobResult> {
  const { prisma, writeAudit, now, invoice, payload, event_id } = args;

  // ─── Amount cross-check (security.md rule 3) ───
  // The payload's amount MUST match what we billed. If Xendit ever sends
  // a tampered or stale event, refusing to mutate state here is the last
  // line of defence before fraudulent state advances.
  const payloadAmountCents = extractAmountCents(payload);
  if (payloadAmountCents !== null && payloadAmountCents !== invoice.amount_cents) {
    await writeAudit(prisma, {
      organizationId: invoice.organization_id,
      userId: null,
      action: 'PLATFORM:XENDIT_WEBHOOK_AMOUNT_MISMATCH',
      entity: 'Invoice',
      entityId: invoice.id,
      before: { amount_cents: invoice.amount_cents } as Prisma.InputJsonValue,
      after: {
        event_id,
        claimed_amount_cents: payloadAmountCents,
      } as Prisma.InputJsonValue,
    });
    return { status: 'amount_mismatch', xendit_invoice_id: invoice.id };
  }

  // ─── Resolve the parent Subscription for period advancement ───
  const subscription = await prisma.subscription.findUnique({
    where: { id: invoice.subscription_id },
  });
  if (!subscription) {
    // Defensive: if FK integrity says this can't happen, but a manual data
    // patch did something odd, surface it as PLATFORM and ack.
    await writeAudit(prisma, {
      organizationId: invoice.organization_id,
      userId: null,
      action: 'PLATFORM:XENDIT_WEBHOOK_ORPHAN',
      entity: 'Subscription',
      entityId: invoice.subscription_id,
      before: null,
      after: { event_id } as Prisma.InputJsonValue,
    });
    return { status: 'invoice_not_found', xendit_invoice_id: invoice.id };
  }

  const paidAt = now();
  const pdfUrl = extractPdfUrl(payload);

  // ─── Advance the billing period by one month ───
  // Cleanly aligned: the new period starts at the end of the prior period
  // (which is also "now-ish" for on-time payment), so cycles never drift.
  const newPeriodStart = subscription.current_period_end;
  const newPeriodEnd = new Date(newPeriodStart);
  newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'paid',
        paid_at: paidAt,
        ...(pdfUrl !== null ? { pdf_url: pdfUrl } : {}),
      },
    });

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        current_period_start: newPeriodStart,
        current_period_end: newPeriodEnd,
      },
    });

    await writeAudit(tx, {
      organizationId: invoice.organization_id,
      userId: null,
      action: 'UPDATE',
      entity: 'Subscription',
      entityId: subscription.id,
      before: {
        status: subscription.status,
        current_period_start: subscription.current_period_start.toISOString(),
        current_period_end: subscription.current_period_end.toISOString(),
      } as Prisma.InputJsonValue,
      after: {
        status: 'active',
        current_period_start: newPeriodStart.toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
        triggered_by_event_id: event_id,
      } as Prisma.InputJsonValue,
    });
  });

  return {
    status: 'paid',
    invoice_id: invoice.id,
    subscription_id: subscription.id,
  };
}

// ─── invoice.expired handler ───────────────────────────────────
interface ExpiredArgs {
  prisma: XenditWebhookPrismaClient;
  writeAudit: typeof writeAuditLog;
  now: () => Date;
  invoice: NonNullable<
    Awaited<ReturnType<XenditWebhookPrismaClient['invoice']['findUnique']>>
  >;
  event_id: string;
}

async function handleInvoiceExpired(
  args: ExpiredArgs,
): Promise<XenditWebhookJobResult> {
  const { prisma, writeAudit, now, invoice, event_id } = args;

  const subscription = await prisma.subscription.findUnique({
    where: { id: invoice.subscription_id },
  });
  if (!subscription) {
    return { status: 'invoice_not_found', xendit_invoice_id: invoice.id };
  }

  // Grace period kickoff (Phase 8 Item 3 sub-session 3c-ii-b).
  // grace_period_end = now + 7 days. The grace-sweeper cron (every 6h)
  // transitions past_due → suspended once this passes. Setting it here
  // (not in the cron) makes the deadline observable in the UI banner
  // the moment the webhook lands, not on the next cron tick.
  const graceEnd = addDaysUtc(now(), GRACE_PERIOD_DAYS);

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'failed' },
    });

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'past_due',
        grace_period_end: graceEnd,
      },
    });

    await writeAudit(tx, {
      organizationId: invoice.organization_id,
      userId: null,
      action: 'UPDATE',
      entity: 'Subscription',
      entityId: subscription.id,
      before: { status: subscription.status } as Prisma.InputJsonValue,
      after: {
        status: 'past_due',
        grace_period_end: graceEnd.toISOString(),
        triggered_by_event_id: event_id,
      } as Prisma.InputJsonValue,
    });
  });

  return {
    status: 'expired',
    invoice_id: invoice.id,
    subscription_id: subscription.id,
  };
}

// ─── BullMQ Worker wrapper ─────────────────────────────────────
/**
 * Construct the BullMQ Worker. Thin wrapper around
 * processXenditWebhookJob — keeps the testable handler decoupled
 * from BullMQ + Redis + the live platformPrisma singleton.
 */
export function createXenditWebhookWorker(): Worker<XenditWebhookJob> {
  const worker = new Worker<XenditWebhookJob>(
    QUEUE_NAMES.xenditWebhook,
    async (job: Job<XenditWebhookJob>) => {
      return processXenditWebhookJob(job.data, {
        prisma: platformPrisma as unknown as XenditWebhookPrismaClient,
        writeAuditLog,
      });
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // sequential — see file header
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[xendit-webhook] Job ${job?.id ?? 'unknown'} (event_id=${job?.data?.event_id ?? 'unknown'}) failed:`,
      err.message,
    );
  });

  return worker;
}
