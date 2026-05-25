/**
 * Phase 8 Item 3b-ii — xendit-webhook worker unit tests.
 *
 * Test target: processXenditWebhookJob (the pure handler from
 * @yelli/jobs/workers/xendit-webhook). The BullMQ Worker wrapper
 * is excluded from unit coverage — it's a thin adapter that wires
 * the handler to the queue + Redis connection.
 *
 * LOCATION NOTE: This test lives in apps/web (not packages/jobs)
 * because apps/web is the only workspace with vitest configured.
 * Setting up vitest in packages/jobs would add 5+ infra files for
 * no incremental safety beyond what testing the pure handler buys
 * us. The handler is exported from @yelli/jobs so the test imports
 * it cleanly across the workspace boundary.
 *
 * Mocking strategy: dependency-injection (no vi.mock). The handler
 * accepts {prisma, writeAuditLog, now} so each test wires the exact
 * stubs it needs and asserts directly on vi.fn() call records. This
 * mirrors the pattern in webhook-verify.test.ts (3b-i).
 */
import { Prisma } from "@yelli/db";
import {
  processXenditWebhookJob,
  type XenditWebhookHandlerDeps,
  type XenditWebhookPrismaClient,
} from "@yelli/jobs";
import { describe, expect, it, vi } from "vitest";

// ─── Fixtures ──────────────────────────────────────────────────
const FIXED_NOW = new Date("2026-05-24T12:00:00.000Z");

const baseInvoice = {
  id: "inv_clxxx111",
  organization_id: "org_clxxx001",
  subscription_id: "sub_clxxx222",
  amount_cents: 299900, // PHP 2,999.00 (pro tier)
  status: "pending",
};

const baseSubscription = {
  id: "sub_clxxx222",
  organization_id: "org_clxxx001",
  status: "trialing",
  current_period_start: new Date("2026-04-24T00:00:00.000Z"),
  current_period_end: new Date("2026-05-24T00:00:00.000Z"),
};

function makeJob(overrides: {
  event_id?: string;
  event_type?: string;
  external_id?: string;
  payload?: Record<string, unknown>;
}) {
  return {
    event_id: overrides.event_id ?? "evt_xnd_abc123",
    event_type: overrides.event_type ?? "invoice.paid",
    external_id: overrides.external_id ?? "inv_xnd_xyz789",
    payload: overrides.payload ?? { amount: 2999, pdf_url: "https://x.co/i.pdf" },
    received_at: "2026-05-24T11:59:59.000Z",
  };
}

// Build a fresh deps stub per test — no shared state across cases.
function makeDeps(opts?: {
  invoice?: typeof baseInvoice | null;
  subscription?: typeof baseSubscription | null;
  duplicateEvent?: boolean;
}): XenditWebhookHandlerDeps & {
  // expose internals for assertions
  _prismaMock: {
    processedWebhookEvent: { create: ReturnType<typeof vi.fn> };
    invoice: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    subscription: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    auditLog: { create: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  _writeAuditMock: ReturnType<typeof vi.fn>;
} {
  const invoice = opts?.invoice === undefined ? baseInvoice : opts.invoice;
  const subscription =
    opts?.subscription === undefined ? baseSubscription : opts.subscription;

  const processedWebhookEventCreate = opts?.duplicateEvent
    ? vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "5.22.0",
          meta: { target: ["event_id"] },
        }),
      )
    : vi.fn().mockResolvedValue({});

  const invoiceFindUnique = vi.fn().mockResolvedValue(invoice);
  const invoiceUpdate = vi.fn().mockResolvedValue({});
  const subscriptionFindUnique = vi.fn().mockResolvedValue(subscription);
  const subscriptionUpdate = vi.fn().mockResolvedValue({});
  const auditLogCreate = vi.fn().mockResolvedValue({});

  // $transaction: invoke the callback with the same stub client so the
  // worker's writes inside the transaction land on the same mocks we assert.
  const prismaMock = {
    processedWebhookEvent: { create: processedWebhookEventCreate },
    invoice: { findUnique: invoiceFindUnique, update: invoiceUpdate },
    subscription: { findUnique: subscriptionFindUnique, update: subscriptionUpdate },
    auditLog: { create: auditLogCreate },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(prismaMock),
    ),
  };

  const writeAuditMock = vi.fn(async (tx: unknown, entry: unknown) => {
    // Mirror the real writeAuditLog by calling tx.auditLog.create — keeps
    // tx-vs-outer-client routing assertable from a single mock surface.
    const t = tx as { auditLog: { create: (args: unknown) => Promise<unknown> } };
    await t.auditLog.create({ data: entry });
  });

  return {
    prisma: prismaMock as unknown as XenditWebhookPrismaClient,
    writeAuditLog: writeAuditMock as unknown as XenditWebhookHandlerDeps["writeAuditLog"],
    now: () => FIXED_NOW,
    _prismaMock: prismaMock,
    _writeAuditMock: writeAuditMock,
  };
}

// ─── Tests ─────────────────────────────────────────────────────
describe("processXenditWebhookJob — invoice.paid", () => {
  it("transitions Invoice → paid + Subscription → active + advances period + writes AuditLog", async () => {
    const deps = makeDeps();
    const result = await processXenditWebhookJob(makeJob({}), deps);

    expect(result).toEqual({
      status: "paid",
      invoice_id: baseInvoice.id,
      subscription_id: baseSubscription.id,
    });

    // Idempotency row inserted first
    expect(deps._prismaMock.processedWebhookEvent.create).toHaveBeenCalledWith({
      data: {
        event_id: "evt_xnd_abc123",
        provider: "xendit",
        event_type: "invoice.paid",
      },
    });

    // Invoice update — paid + paid_at + pdf_url
    expect(deps._prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: baseInvoice.id },
      data: {
        status: "paid",
        paid_at: FIXED_NOW,
        pdf_url: "https://x.co/i.pdf",
      },
    });

    // Subscription update — active + period advanced one month from prior end
    const expectedNewStart = baseSubscription.current_period_end;
    const expectedNewEnd = new Date(expectedNewStart);
    expectedNewEnd.setMonth(expectedNewEnd.getMonth() + 1);
    expect(deps._prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: baseSubscription.id },
      data: {
        status: "active",
        current_period_start: expectedNewStart,
        current_period_end: expectedNewEnd,
      },
    });

    // AuditLog emitted with action=UPDATE, entity=Subscription, includes event_id trace
    expect(deps._writeAuditMock).toHaveBeenCalledTimes(1);
    const auditEntry = deps._writeAuditMock.mock.calls[0]?.[1] as {
      action: string;
      entity: string;
      entityId: string;
      organizationId: string;
      after: { triggered_by_event_id: string };
    };
    expect(auditEntry.action).toBe("UPDATE");
    expect(auditEntry.entity).toBe("Subscription");
    expect(auditEntry.entityId).toBe(baseSubscription.id);
    expect(auditEntry.organizationId).toBe(baseInvoice.organization_id);
    expect(auditEntry.after.triggered_by_event_id).toBe("evt_xnd_abc123");

    // Ensure the audit write went via $transaction (atomic with the row updates)
    expect(deps._prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("omits pdf_url from Invoice update when payload has no pdf_url", async () => {
    const deps = makeDeps();
    await processXenditWebhookJob(
      makeJob({ payload: { amount: 2999 } }),
      deps,
    );

    const updateCall = deps._prismaMock.invoice.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).not.toHaveProperty("pdf_url");
    expect(updateCall.data["status"]).toBe("paid");
  });
});

describe("processXenditWebhookJob — invoice.expired", () => {
  it("transitions Invoice → failed + Subscription → past_due + sets grace_period_end = now + 7 days + writes AuditLog", async () => {
    const deps = makeDeps();
    const result = await processXenditWebhookJob(
      makeJob({
        event_id: "evt_xnd_expire1",
        event_type: "invoice.expired",
        payload: {},
      }),
      deps,
    );

    expect(result).toEqual({
      status: "expired",
      invoice_id: baseInvoice.id,
      subscription_id: baseSubscription.id,
    });

    expect(deps._prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: baseInvoice.id },
      data: { status: "failed" },
    });

    // Phase 8 Item 3 sub-session 3c-ii-b: grace_period_end MUST be written
    // on the same update as the status flip so the past-due banner has the
    // deadline available the moment the webhook lands (not on next cron tick).
    // 7 days from FIXED_NOW = 2026-05-31T12:00:00.000Z.
    const expectedGraceEnd = new Date("2026-05-31T12:00:00.000Z");
    expect(deps._prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: baseSubscription.id },
      data: {
        status: "past_due",
        grace_period_end: expectedGraceEnd,
      },
    });

    const auditEntry = deps._writeAuditMock.mock.calls[0]?.[1] as {
      action: string;
      entity: string;
      after: {
        status: string;
        triggered_by_event_id: string;
        grace_period_end: string;
      };
    };
    expect(auditEntry.action).toBe("UPDATE");
    expect(auditEntry.entity).toBe("Subscription");
    expect(auditEntry.after.status).toBe("past_due");
    expect(auditEntry.after.triggered_by_event_id).toBe("evt_xnd_expire1");
    expect(auditEntry.after.grace_period_end).toBe(
      "2026-05-31T12:00:00.000Z",
    );
  });
});

describe("processXenditWebhookJob — idempotency", () => {
  it("returns duplicate without mutating Invoice/Subscription when event_id already processed (P2002)", async () => {
    const deps = makeDeps({ duplicateEvent: true });
    const result = await processXenditWebhookJob(makeJob({}), deps);

    expect(result).toEqual({ status: "duplicate", event_id: "evt_xnd_abc123" });

    // Critical regression guard: NO state mutation after duplicate hit
    expect(deps._prismaMock.invoice.findUnique).not.toHaveBeenCalled();
    expect(deps._prismaMock.invoice.update).not.toHaveBeenCalled();
    expect(deps._prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(deps._writeAuditMock).not.toHaveBeenCalled();
    expect(deps._prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rethrows non-P2002 Prisma errors so BullMQ can retry", async () => {
    const failingCreate = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Connection refused", {
        code: "P1001",
        clientVersion: "5.22.0",
      }),
    );
    const deps = makeDeps();
    deps._prismaMock.processedWebhookEvent.create = failingCreate;

    await expect(
      processXenditWebhookJob(makeJob({}), deps),
    ).rejects.toMatchObject({ code: "P1001" });
  });
});

describe("processXenditWebhookJob — defensive paths", () => {
  it("ack's unknown event_type and writes PLATFORM AuditLog without mutating state", async () => {
    const deps = makeDeps();
    const result = await processXenditWebhookJob(
      makeJob({
        event_id: "evt_xnd_unknown",
        event_type: "invoice.something_new",
        payload: {},
      }),
      deps,
    );

    expect(result).toEqual({
      status: "unknown_event_type",
      event_type: "invoice.something_new",
    });
    expect(deps._prismaMock.invoice.update).not.toHaveBeenCalled();
    expect(deps._prismaMock.subscription.update).not.toHaveBeenCalled();

    const auditEntry = deps._writeAuditMock.mock.calls[0]?.[1] as {
      action: string;
      organizationId: string;
    };
    expect(auditEntry.action).toBe("PLATFORM:XENDIT_WEBHOOK_UNHANDLED");
    expect(auditEntry.organizationId).toBe(baseInvoice.organization_id);
  });

  it("refuses to mutate state when payload amount mismatches stored Invoice amount", async () => {
    const deps = makeDeps();
    const result = await processXenditWebhookJob(
      makeJob({
        payload: { amount: 100, pdf_url: "https://attacker.example/i.pdf" },
      }),
      deps,
    );

    expect(result).toEqual({
      status: "amount_mismatch",
      xendit_invoice_id: baseInvoice.id,
    });

    // Critical: NO Invoice or Subscription update on amount mismatch
    expect(deps._prismaMock.invoice.update).not.toHaveBeenCalled();
    expect(deps._prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(deps._prismaMock.$transaction).not.toHaveBeenCalled();

    const auditEntry = deps._writeAuditMock.mock.calls[0]?.[1] as {
      action: string;
      after: { claimed_amount_cents: number };
    };
    expect(auditEntry.action).toBe("PLATFORM:XENDIT_WEBHOOK_AMOUNT_MISMATCH");
    expect(auditEntry.after.claimed_amount_cents).toBe(10000);
  });

  it("ack's invoice_not_found when xendit_invoice_id has no matching Invoice row", async () => {
    const deps = makeDeps({ invoice: null });
    const result = await processXenditWebhookJob(
      makeJob({ external_id: "inv_xnd_orphan" }),
      deps,
    );

    expect(result).toEqual({
      status: "invoice_not_found",
      xendit_invoice_id: "inv_xnd_orphan",
    });
    expect(deps._prismaMock.invoice.update).not.toHaveBeenCalled();
    expect(deps._prismaMock.subscription.findUnique).not.toHaveBeenCalled();

    const auditEntry = deps._writeAuditMock.mock.calls[0]?.[1] as {
      action: string;
      organizationId: string | null;
      entity: string;
      entityId: string;
    };
    expect(auditEntry.action).toBe("PLATFORM:XENDIT_WEBHOOK_ORPHAN");
    expect(auditEntry.organizationId).toBeNull();
    expect(auditEntry.entity).toBe("Invoice");
    expect(auditEntry.entityId).toBe("inv_xnd_orphan");
  });
});
