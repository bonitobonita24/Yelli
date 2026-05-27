import { test, expect } from "@playwright/test";

import { seedRecording } from "./fixtures/seed-recording";
import { recordingDeleteCopy } from "../apps/web/src/components/recordings/recording-delete-copy";

/**
 * Spec (b): Soft-delete recording via AlertDialog confirmation
 *
 * Exercises the full UI delete path:
 *   1. Seed a Recording with status="ready" (delete button enabled).
 *   2. Navigate to /app/recordings.
 *   3. Locate the row via data-testid (added in Task 5).
 *   4. Click the delete trigger (aria-label from recordingDeleteCopy.triggerLabel).
 *   5. Assert the AlertDialog opens with the expected title + description.
 *   6. Click the confirm button (recordingDeleteCopy.confirmLabel).
 *   7. Assert the dialog closes and the row disappears from the list.
 *
 * Cleanup: recordings.softDelete is idempotent — calling cleanup() on an
 * already-soft-deleted recording is safe. seed-recording.ts cleanup uses
 * per-row try/catch which tolerates prior deletion.
 *
 * Plan deviation from docs/superpowers/plans/2026-05-26-playwright-e2e-plan.md L820-859:
 *   - Plan template assumes seedMeeting(request) + seedRecording(request, meetingId).
 *   - Actual fixture (Task 4): seedRecording(opts?) is parameterless and self-contained.
 *     It creates its own Meeting + CallLog + Recording chain and returns { id, cleanup }.
 *   - This spec aligns with the actual fixture, identical pattern to Task 5's spec (a) test 1.
 *
 * Selectors:
 *   - Row:         page.getByTestId(`recording-row-${id}`)
 *   - Trigger:     page.getByRole("button", { name: recordingDeleteCopy.triggerLabel })
 *   - Dialog:      page.getByRole("alertdialog")
 *   - Confirm:     dialog.getByRole("button", { name: recordingDeleteCopy.confirmLabel, exact: true })
 *     ("exact: true" prevents accidental match against the trigger button which has the
 *      same accessible name "Delete recording" — confirmLabel is just "Delete".)
 */

test.describe("Recording soft-delete", () => {
  test("soft-deletes a recording via AlertDialog and removes it from the list", async ({
    page,
  }) => {
    const recording = await seedRecording({ status: "ready" });

    try {
      await page.goto("/app/recordings");
      await page.waitForLoadState("networkidle");

      // Step 1: row is initially visible.
      const row = page.getByTestId(`recording-row-${recording.id}`);
      await expect(row).toBeVisible({ timeout: 10_000 });

      // Step 2: click the delete trigger scoped to this row.
      const trigger = row.getByRole("button", {
        name: recordingDeleteCopy.triggerLabel,
      });
      await trigger.click();

      // Step 3: AlertDialog opens with expected title + description.
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(
        dialog.getByText(recordingDeleteCopy.dialogTitle),
      ).toBeVisible();
      await expect(
        dialog.getByText(recordingDeleteCopy.dialogDescription),
      ).toBeVisible();

      // Step 4: click confirm — must be exact match so we don't re-hit the
      // trigger button which shares the "Delete recording" accessible name.
      const confirm = dialog.getByRole("button", {
        name: recordingDeleteCopy.confirmLabel,
        exact: true,
      });
      await confirm.click();

      // Step 5: dialog closes.
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // Step 6: row disappears from the list (router.refresh + invalidate
      // re-fetches recordings.list which excludes soft-deleted rows).
      await expect(row).toBeHidden({ timeout: 10_000 });
    } finally {
      await recording.cleanup();
    }
  });
});
