import { Queue, type DefaultJobOptions } from 'bullmq';

import { getRedisConnection } from './connection';

export interface TenantJobBase {
  organizationId: string;
  userId: string | null; // null for cron / system jobs
}

export interface RecordingProcessingJob extends TenantJobBase {
  recordingId: string;
  meetingId: string;
}

export interface ReportGenerationJob extends TenantJobBase {
  reportType: 'usage' | 'billing' | 'audit' | 'calls';
  rangeStart: string; // ISO date
  rangeEnd: string; // ISO date
  format: 'csv' | 'pdf';
}

export interface UsageCalculationJob extends TenantJobBase {
  cycleStart: string; // ISO date
  cycleEnd: string;
}

export interface BillingCycleJob extends TenantJobBase {
  cycleDate: string; // ISO date — the day this cron run represents
}

const defaultJobOptions = (retries: number): DefaultJobOptions => ({
  attempts: retries,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
});

export const QUEUE_NAMES = {
  recordingProcessing: 'recording-processing',
  reportGeneration: 'report-generation',
  usageCalculation: 'usage-calculation',
  billingCycle: 'billing-cycle',
} as const;

const connection = getRedisConnection();

export const recordingProcessingQueue = new Queue<RecordingProcessingJob>(
  QUEUE_NAMES.recordingProcessing,
  { connection, defaultJobOptions: defaultJobOptions(3) },
);

export const reportGenerationQueue = new Queue<ReportGenerationJob>(
  QUEUE_NAMES.reportGeneration,
  { connection, defaultJobOptions: defaultJobOptions(2) },
);

export const usageCalculationQueue = new Queue<UsageCalculationJob>(
  QUEUE_NAMES.usageCalculation,
  { connection, defaultJobOptions: defaultJobOptions(3) },
);

export const billingCycleQueue = new Queue<BillingCycleJob>(
  QUEUE_NAMES.billingCycle,
  { connection, defaultJobOptions: defaultJobOptions(5) },
);

/**
 * Cron schedules — call once at app boot to register repeatable jobs.
 * usage-calculation: every 15 minutes
 * billing-cycle:     daily at 02:00 server time
 */
export async function registerCronJobs(): Promise<void> {
  await usageCalculationQueue.upsertJobScheduler(
    'usage-calculation:cron',
    { pattern: '*/15 * * * *' },
    {
      name: 'usage-calculation-cron',
      data: { organizationId: '', userId: null, cycleStart: '', cycleEnd: '' },
      // Worker enumerates active tenants — empty organizationId here is a sentinel.
    },
  );

  await billingCycleQueue.upsertJobScheduler(
    'billing-cycle:cron',
    { pattern: '0 2 * * *' },
    {
      name: 'billing-cycle-cron',
      data: { organizationId: '', userId: null, cycleDate: '' },
    },
  );
}
