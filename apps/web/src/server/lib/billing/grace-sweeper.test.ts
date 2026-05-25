/**
 * Phase 8 Item 3 sub-session 3c-ii-b — grace-sweeper worker unit tests.
 *
 * Test target: processGraceSweeperJob (the pure handler from
 * @yelli/jobs/workers/grace-sweeper). The BullMQ Worker wrapper
 * is excluded from unit coverage — it's a thin adapter.
 *
 * LOCATION NOTE: Lives in apps/web because vitest is only configured
 * there (mirrors the webhook-worker.test.ts decision per LESSONS_PENDING
 * in STATE.md — vitest in packages/jobs is 5+ infra files for no gain).
 *
 * Mocking strategy: dependency injection. The handler accepts
 * {prisma, writeAuditLog, now} so each test wires exact vi.fn() stubs
 * and asserts on call records. No vi.mock at module level.
 *
 * IDEMPOTENCY GUARANTEE: the WHERE filter (status='past_due' AND
 * grace_period_end <= now) excludes already-suspended rows AND active
 * rows AND past_due rows with future grace_end. These tests assert the
 * filter shape, not the filtered rows themselves — the filter IS the
 * idempotency guarantee.
 */
import {
  processGraceSweeperJob,
  type GraceSweeperHandlerDeps,
  type GraceSweeperPrismaClient,
} from "@yelli/jobs";
import { describe, expect, it, vi } from "vitest";

// ─── Fixtures ──────────────────────────────────────────────────
const FIXED_NOW = new Date("2026-05-31T12:00:00.000Z");

type EligibleSubRow = {
  id: string;
  organization_id: string;
  plan_tier: string;
  status: string;
  grace_period_end: Date | null;
};

const eligibleSubA: EligibleSubRow = {
  id: "sub_a",
  organization_id: "org_a",
  plan_tier: "pro",
  status: "past_due",
  grace_period_end: new Date("2026-05-30T12:00:00.000Z"), // 24h ago
};

const eligibleSubB: EligibleSubRow = {
  id: "sub_b",
  organization_id: "org_b",
  plan_tier: "enterprise",
  status: "past_due",
  grace_period_end: new Date("2026-05-25T12:00:00.000Z"), // ~6 days ago
};

// Build a fresh deps stub per test — no shared state across cases.
function makeDeps(opts?: {
  eligibleRows?: EligibleSubRow[];
  updateThrowsForSubId?: string;
}): GraceSweeperHandlerDeps & {
  _prismaMock: {
    subscription: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    organization: { update: ReturnType<typeof vi.fn> };
    auditLog: { create: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  _writeAuditMock: ReturnType<typeof vi.fn>;
} {
  const eligibleRows = opts?.eligibleRows ?? [eligibleSubA];

  const subscriptionFindMany = vi.fn().mockResolvedValue(eligibleRows);
  const subscriptionUpdate = vi.fn(async (args: { where: { id: string } }) => {
    if (opts?.updateThrowsForSubId === args.where.id) {
      throw new Error("simulated DB failure for " + args.where.id);
    }
    return {};
  });
  const organizationUpdate = vi.fn().mockResolvedValue({});
  const auditLogCreate = vi.fn().mockResolvedValue({});

  const prismaMock = {
    subscription: { findMany: subscriptionFindMany, update: subscriptionUpdate },
    organization: { update: organizationUpdate },
    auditLog: { create: auditLogCreate },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(prismaMock),
    ),
  };

  const writeAuditMock = vi.fn(async (tx: unknown, entry: unknown) => {
    const t = tx as { auditLog: { create: (args: unknown) => Promise<unknown> } };
    await t.auditLog.create({ data: entry });
  });

  return {
    prisma: prismaMock as unknown as GraceSweeperPrismaClient,
    writeAuditLog: writeAuditMock as unknown as GraceSweeperHandlerDeps["writeAuditLog"],
    now: () => FIXED_NOW,
    _prismaMock: prismaMock,
    _writeAuditMock: writeAuditMock,
  };
}

const cronJob = {
  organizationId: "",
  userId: null,
  cycleAt: "2026-05-31T12:00:00.000Z",
};

// ─── Tests ─────────────────────────────────────────────────────
describe("processGraceSweeperJob — happy path", () => {
  it("suspends a single eligible row: subscription → suspended + organization downgraded + audit emitted", async () => {
    const deps = makeDeps();
    const result = await processGraceSweeperJob(cronJob, deps);

    expect(result).toEqual({
      mode: "cron",
      scanned: 1,
      suspended: 1,
      failed: 0,
    });

    // findMany was called with the exact past_due + grace_end<=now filter
    expect(deps._prismaMock.subscription.findMany).toHaveBeenCalledWith({
      where: {
        status: "past_due",
        grace_period_end: { lte: FIXED_NOW, not: null },
      },
      select: {
        id: true,
        organization_id: true,
        plan_tier: true,
        status: true,
        grace_period_end: true,
      },
    });

    // Subscription flipped to suspended
    expect(deps._prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub_a" },
      data: { status: "suspended" },
    });

    // Organization downgraded + suspension timestamp + denormalized status
    expect(deps._prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: "org_a" },
      data: {
        subscription_status: "suspended",
        plan_tier: "free",
        suspended_at: FIXED_NOW,
      },
    });

    // AuditLog: PLATFORM action, entity=Subscription, before/after preserved
    expect(deps._writeAuditMock).toHaveBeenCalledTimes(1);
    const audit = deps._writeAuditMock.mock.calls[0]?.[1] as {
      action: string;
      entity: string;
      entityId: string;
      organizationId: string;
      userId: null;
      before: { status: string; plan_tier: string; grace_period_end: string };
      after: { status: string; plan_tier: string; suspended_at: string };
    };
    expect(audit.action).toBe("PLATFORM:GRACE_PERIOD_EXPIRED");
    expect(audit.entity).toBe("Subscription");
    expect(audit.entityId).toBe("sub_a");
    expect(audit.organizationId).toBe("org_a");
    expect(audit.userId).toBeNull();
    expect(audit.before.status).toBe("past_due");
    expect(audit.before.plan_tier).toBe("pro");
    expect(audit.before.grace_period_end).toBe("2026-05-30T12:00:00.000Z");
    expect(audit.after.status).toBe("suspended");
    expect(audit.after.plan_tier).toBe("free");
    expect(audit.after.suspended_at).toBe("2026-05-31T12:00:00.000Z");

    // All three writes ran inside the same per-row transaction
    expect(deps._prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("processes multiple eligible rows independently and reports counts", async () => {
    const deps = makeDeps({ eligibleRows: [eligibleSubA, eligibleSubB] });
    const result = await processGraceSweeperJob(cronJob, deps);

    expect(result).toEqual({
      mode: "cron",
      scanned: 2,
      suspended: 2,
      failed: 0,
    });
    expect(deps._prismaMock.subscription.update).toHaveBeenCalledTimes(2);
    expect(deps._prismaMock.organization.update).toHaveBeenCalledTimes(2);
    expect(deps._writeAuditMock).toHaveBeenCalledTimes(2);
    expect(deps._prismaMock.$transaction).toHaveBeenCalledTimes(2);

    // Distinct tenants — second org_id is org_b not org_a
    const orgUpdateCalls = deps._prismaMock.organization.update.mock.calls;
    expect(orgUpdateCalls[0]?.[0]).toMatchObject({ where: { id: "org_a" } });
    expect(orgUpdateCalls[1]?.[0]).toMatchObject({ where: { id: "org_b" } });
  });
});

describe("processGraceSweeperJob — empty + idempotency", () => {
  it("returns {scanned: 0, suspended: 0} when no rows match (no writes)", async () => {
    const deps = makeDeps({ eligibleRows: [] });
    const result = await processGraceSweeperJob(cronJob, deps);

    expect(result).toEqual({
      mode: "cron",
      scanned: 0,
      suspended: 0,
      failed: 0,
    });
    expect(deps._prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(deps._prismaMock.organization.update).not.toHaveBeenCalled();
    expect(deps._writeAuditMock).not.toHaveBeenCalled();
    expect(deps._prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("active + already-suspended rows are excluded by the findMany filter (regression guard)", async () => {
    // The filter is the idempotency guarantee — assert its exact shape so
    // a future refactor that loosens it (e.g. drops `status: 'past_due'`)
    // would fail this test before reaching production.
    const deps = makeDeps({ eligibleRows: [] });
    await processGraceSweeperJob(cronJob, deps);

    const findCall = deps._prismaMock.subscription.findMany.mock.calls[0]?.[0] as {
      where: { status: string; grace_period_end: { lte: Date; not: null } };
    };
    expect(findCall.where.status).toBe("past_due");
    expect(findCall.where.grace_period_end.lte).toEqual(FIXED_NOW);
    expect(findCall.where.grace_period_end.not).toBeNull();
    // Critically: no `status: { in: [...] }` widening — exactly 'past_due'.
    // This filter is what makes the worker safe to re-run indefinitely.
  });
});

describe("processGraceSweeperJob — partial failure tolerance", () => {
  it("continues past a single-row failure and reports it in the failed counter", async () => {
    const deps = makeDeps({
      eligibleRows: [eligibleSubA, eligibleSubB],
      updateThrowsForSubId: "sub_a",
    });
    const result = await processGraceSweeperJob(cronJob, deps);

    // sub_a fails, sub_b still succeeds — the sweep does not abort mid-loop
    expect(result).toEqual({
      mode: "cron",
      scanned: 2,
      suspended: 1,
      failed: 1,
    });

    // sub_b's organization update DID run (proves the loop continued)
    const orgUpdateCalls = deps._prismaMock.organization.update.mock.calls;
    const updatedOrgIds = orgUpdateCalls.map(
      (c) => (c[0] as { where: { id: string } }).where.id,
    );
    expect(updatedOrgIds).toContain("org_b");
  });
});
