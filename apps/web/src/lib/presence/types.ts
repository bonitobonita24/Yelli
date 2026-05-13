export type PresenceState = "online" | "offline" | "in_call";

export interface PresenceUpdate {
  departmentId: string;
  state: PresenceState;
}
