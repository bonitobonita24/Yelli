/**
 * Pure copy constants and payload builder for the recording delete UI.
 * Extracted into a plain .ts file (no JSX) so they can be imported by
 * vitest tests running in environment: "node" without JSX parse errors.
 * Canonical pattern: same as end-of-call-policy.ts.
 */

/**
 * Static copy used in the delete confirmation UI.
 * Exported as a pure constant so it can be verified in unit tests
 * without a DOM or React rendering environment.
 */
export const recordingDeleteCopy = {
  triggerLabel: "Delete recording",
  dialogTitle: "Delete this recording?",
  dialogDescription:
    "The file is soft-deleted and excluded from list views. Storage cleanup runs on the org retention schedule.",
  cancelLabel: "Cancel",
  confirmLabel: "Delete",
} as const;

/**
 * Builds the payload passed to recordings.softDelete.mutate.
 * Extracted as a pure function so the shape is testable independently
 * of the React component tree.
 */
export function buildDeletePayload(recordingId: string): { id: string } {
  return { id: recordingId };
}
