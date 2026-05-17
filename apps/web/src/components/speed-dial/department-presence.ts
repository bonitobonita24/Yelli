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

export function selectDepartmentPresence(
  department: DepartmentBinding,
  online: Readonly<Record<string, boolean>>,
): PresenceState {
  if (department.default_user_id === null) return "offline";
  return online[department.default_user_id] === true ? "online" : "offline";
}
