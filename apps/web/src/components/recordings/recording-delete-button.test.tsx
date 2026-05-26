/**
 * (recording-delete-button): pure copy and payload shape that the delete UI
 * uses. Tested as pure values so they stay in the "node" vitest environment
 * (no jsdom / no RTL) — same pattern as end-of-call-policy.test.ts.
 */

import { describe, expect, it } from "vitest";

import {
  buildDeletePayload,
  recordingDeleteCopy,
} from "./recording-delete-copy";

describe("recordingDeleteCopy", () => {
  it("trigger button has the accessible label 'Delete recording'", () => {
    expect(recordingDeleteCopy.triggerLabel).toBe("Delete recording");
  });

  it("dialog title asks to confirm deletion", () => {
    expect(recordingDeleteCopy.dialogTitle).toMatch(/delete this recording/i);
  });

  it("dialog description mentions soft-delete and storage cleanup", () => {
    expect(recordingDeleteCopy.dialogDescription).toMatch(/soft-deleted/i);
    expect(recordingDeleteCopy.dialogDescription).toMatch(/storage/i);
  });

  it("cancel label is 'Cancel'", () => {
    expect(recordingDeleteCopy.cancelLabel).toBe("Cancel");
  });

  it("buildDeletePayload wraps recordingId in the expected mutation shape", () => {
    expect(buildDeletePayload("rec-abc123")).toEqual({ id: "rec-abc123" });
  });
});
