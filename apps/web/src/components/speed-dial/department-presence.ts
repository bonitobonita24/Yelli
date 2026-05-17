/**
 * Pure presence-derivation helpers for the Speed Dial Board.
 * Node-testable per [[pure-helper-extraction-pattern]] — no React deps.
 */
import type { PresenceState } from "@/lib/presence/types";

export interface DepartmentBinding {
  id: string;
  default_user_id: string | null;
}

export function extractBoundUserIds(
  departments: ReadonlyArray<DepartmentBinding>,
): string[] {
  const out: string[] = [];
  for (const d of departments) {
    if (d.default_user_id !== null) out.push(d.default_user_id);
  }
  return out;
}

/**
 * Derive a department's PresenceState from the bound user's online status
 * and the org's in-call user set.
 *
 * Precedence (Phase 7 #14 locked design):
 *   1. default_user_id is null (unbound)         → "offline"
 *   2. bound user is in the inCall set           → "in_call"  (wins)
 *   3. bound user is in the online map = true    → "online"
 *   4. else                                       → "offline"
 *
 * The in_call branch wins over online even when the online map says
 * offline — in_call is the authoritative signal during a live call.
 * See docs/superpowers/specs/2026-05-17-in-call-state-design.md
 * locked decision 3.
 */
export function selectDepartmentPresence(
  department: DepartmentBinding,
  online: Readonly<Record<string, boolean>>,
  inCall: ReadonlySet<string>,
): PresenceState {
  if (department.default_user_id === null) return "offline";
  if (inCall.has(department.default_user_id)) return "in_call";
  return online[department.default_user_id] === true ? "online" : "offline";
}
