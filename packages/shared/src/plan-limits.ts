import type { PlanTier } from './schemas/organization';

export type NumericPlanFeature =
  | 'users'
  | 'admins'
  | 'departments'
  | 'autoAnswerStations'
  | 'participantsPerCall'
  | 'callDurationMinutes'
  | 'recordingHoursPerMonth'
  | 'chatRetentionDays';

export type BooleanPlanFeature =
  | 'whiteLabel'
  | 'filePersistence'
  | 'whiteboardPersistence';

export type PlanFeature = NumericPlanFeature | BooleanPlanFeature;

export interface PlanLimits {
  // Numeric caps
  users: number;
  admins: number;
  departments: number;
  autoAnswerStations: number;
  participantsPerCall: number;
  callDurationMinutes: number;
  recordingHoursPerMonth: number;
  chatRetentionDays: number;
  // Boolean capabilities
  whiteLabel: boolean;
  filePersistence: boolean;
  whiteboardPersistence: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    users: 10,
    admins: 1,
    departments: 5,
    autoAnswerStations: 2,
    participantsPerCall: 8,
    callDurationMinutes: 45,
    recordingHoursPerMonth: 0,
    chatRetentionDays: 30,
    whiteLabel: false,
    filePersistence: false,
    whiteboardPersistence: false,
  },
  pro: {
    users: 50,
    admins: 3,
    departments: 25,
    autoAnswerStations: 10,
    participantsPerCall: 25,
    callDurationMinutes: 240,
    recordingHoursPerMonth: 20,
    chatRetentionDays: 365,
    whiteLabel: false,
    filePersistence: true,
    whiteboardPersistence: true,
  },
  enterprise: {
    users: Number.POSITIVE_INFINITY,
    admins: Number.POSITIVE_INFINITY,
    departments: Number.POSITIVE_INFINITY,
    autoAnswerStations: Number.POSITIVE_INFINITY,
    participantsPerCall: 50,
    callDurationMinutes: Number.POSITIVE_INFINITY,
    recordingHoursPerMonth: 100,
    chatRetentionDays: Number.POSITIVE_INFINITY,
    whiteLabel: true,
    filePersistence: true,
    whiteboardPersistence: true,
  },
};

export function getNumericLimit(
  planTier: PlanTier,
  feature: NumericPlanFeature,
): number {
  return PLAN_LIMITS[planTier][feature];
}

export function isAtNumericLimit(
  planTier: PlanTier,
  feature: NumericPlanFeature,
  currentUsage: number,
): boolean {
  return currentUsage >= getNumericLimit(planTier, feature);
}

export function hasCapability(
  planTier: PlanTier,
  feature: BooleanPlanFeature,
): boolean {
  return PLAN_LIMITS[planTier][feature];
}
