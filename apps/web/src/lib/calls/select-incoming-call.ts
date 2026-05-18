import type { IncomingCallPayload } from "@/lib/livekit/types";

/**
 * Returns true iff the incoming call is destined for one of the current user's
 * bound departments.
 *
 * undefined boundDeptIds (query still loading) and an empty array (user has no
 * binding) both fall through to false — Phase 7 #16 decisions 3 and 4. We do
 * not buffer payloads to retry once the query resolves; the cold-mount race
 * window is sub-second and org-scoped call:incoming retries are not part of
 * the protocol.
 *
 * boundDeptIds is string[] (not single id) because Department.default_user_id
 * has no @unique constraint — one user may man multiple departments.
 */
export function selectIncomingCall(
  payload: Pick<IncomingCallPayload, "recipientDeptId">,
  boundDeptIds: readonly string[] | undefined,
): boolean {
  if (boundDeptIds === undefined) return false;
  return boundDeptIds.includes(payload.recipientDeptId);
}
