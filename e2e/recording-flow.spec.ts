import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { platformPrisma } from "@yelli/db";

import { seedMeeting } from "./fixtures/seed-meeting";
import { seedRecording } from "./fixtures/seed-recording";

/**
 * Spec (a): Recording lifecycle
 *
 * Two complementary tests:
 *
 *   Test 1 — "completed recording appears in /app/recordings feed":
 *     Uses `seedRecording()` (Prisma-direct fixture) to create a completed
 *     Recording row. Navigates to /app/recordings and asserts the row is
 *     visible via its `data-testid={recording-row-${id}}` attribute.
 *
 *   Test 2 — "LIVEKIT_E2E_MOCK guard yields e2e-mock-* egressId via
 *   recordings.start":
 *     Uses `seedMeeting()` (tRPC fixture) + inline `seedActiveCallLog`
 *     helper (Prisma-direct — codebase has no tRPC for opening CallLogs).
 *     Then POST /api/trpc/recordings.start via APIRequestContext, asserts
 *     the returned `egress_id` matches the `e2e-mock-` prefix, then POSTs
 *     /api/trpc/recordings.stop. Exercises the real tRPC path with the
 *     mock guard active.
 *
 * Prerequisites for GREEN (deferred to manual run):
 *   - `.env.test.e2e` populated with WEBMASTER_PASSWORD and
 *     LIVEKIT_E2E_MOCK=true.
 *   - Dev server reachable (Playwright webServer block auto-starts it).
 *
 * Plan deviation: source plan template at
 * docs/superpowers/plans/2026-05-26-playwright-e2e-plan.md L691-738
 * assumed `seedRecording(request, meetingId)` but the actual Task 4
 * fixture is parameterless and self-contained. This spec aligns with
 * the actual fixture signatures.
 */

/**
 * Inline helper: opens an active CallLog (ended_at=null) for an existing
 * meeting so that `recordings.start` tRPC preconditions are satisfied.
 *
 * Why inline (not a fixture): only this spec needs it; no other consumer
 * exists yet. Promote to `e2e/fixtures/` if Task 6 ends up needing it too.
 *
 * Uses platformPrisma (no L6 tenant context in the Playwright runner
 * process — same rationale as seed-recording.ts).
 */
async function seedActiveCallLog(opts: {
  organizationId: string;
  meetingId: string;
  callerUserId: string;
}): Promise<{ callLogId: string; cleanup: () => Promise<void> }> {
  const callLog = await platformPrisma.callLog.create({
    data: {
      organization_id: opts.organizationId,
      meeting_id: opts.meetingId,
      caller_user_id: opts.callerUserId,
      call_type: "meeting",
      started_at: new Date(),
      ended_at: null,
      // CallStatus enum has no "active" — the openness signal is `ended_at: null`.
      // We pick "completed" as a placeholder; recordings.start ignores status.
      status: "completed",
    },
    select: { id: true },
  });

  return {
    callLogId: callLog.id,
    cleanup: async () => {
      try {
        await platformPrisma.callLog.delete({ where: { id: callLog.id } });
      } catch {
        // Tolerate prior deletion (e.g. test teardown raced with Meeting cascade).
      }
    },
  };
}

/**
 * Posts a tRPC mutation via APIRequestContext using the storageState cookie.
 * Mirrors the body shape used by seed-meeting.ts:
 *   POST /api/trpc/<procedure>?batch=1
 *   body: { "0": { "json": <input> } }
 *   response: { "0": { "result": { "data": { "json": <output> } } } }
 */
async function postTrpc<TOutput>(
  request: APIRequestContext,
  procedure: string,
  input: Record<string, unknown>,
): Promise<TOutput> {
  const response = await request.post(`/api/trpc/${procedure}?batch=1`, {
    data: { "0": { json: input } },
    headers: { "content-type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(
      `tRPC ${procedure} failed: ${response.status()} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as {
    0?: { result?: { data?: { json?: TOutput } }; error?: { message?: string } };
  };
  const error = body[0]?.error;
  if (error) {
    throw new Error(`tRPC ${procedure} returned error: ${error.message}`);
  }
  const data = body[0]?.result?.data?.json;
  if (data === undefined) {
    throw new Error(`tRPC ${procedure} returned no data`);
  }
  return data;
}

test.describe("Recording lifecycle", () => {
  test("completed recording appears in /app/recordings feed", async ({
    page,
  }) => {
    const recording = await seedRecording({ status: "ready" });

    try {
      await page.goto("/app/recordings");
      await page.waitForLoadState("networkidle");

      const row = page.getByTestId(`recording-row-${recording.id}`);
      await expect(row).toBeVisible({ timeout: 10_000 });
    } finally {
      await recording.cleanup();
    }
  });

  test("LIVEKIT_E2E_MOCK guard yields e2e-mock-* egressId via recordings.start", async ({
    request,
  }) => {
    const meeting = await seedMeeting(request);

    // Look up the meeting we just created so we can derive its host/org for
    // the CallLog FK. platformPrisma is safe because the test process has no
    // L6 tenant context.
    const meetingRow = await platformPrisma.meeting.findUniqueOrThrow({
      where: { id: meeting.id },
      select: { id: true, organization_id: true, host_user_id: true },
    });

    const callLog = await seedActiveCallLog({
      organizationId: meetingRow.organization_id,
      meetingId: meetingRow.id,
      callerUserId: meetingRow.host_user_id,
    });

    let recordingRowId: string | null = null;

    try {
      const started = await postTrpc<{ id: string; egress_id: string }>(
        request,
        "recordings.start",
        { meetingId: meeting.id },
      );

      expect(started.egress_id).toMatch(/^e2e-mock-/);
      recordingRowId = started.id;

      await postTrpc(request, "recordings.stop", { meetingId: meeting.id });
    } finally {
      if (recordingRowId) {
        try {
          await platformPrisma.recording.delete({ where: { id: recordingRowId } });
        } catch {
          // Best-effort — Meeting cascade may have already removed it.
        }
      }
      await callLog.cleanup();
      await meeting.cleanup();
    }
  });
});
