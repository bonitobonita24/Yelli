// ─── Connection ───────────────────────────────────────────────────────────────
export { getRedisConnection } from './connection';

// ─── Queues & Job Types ───────────────────────────────────────────────────────
export {
  QUEUE_NAMES,
  recordingProcessingQueue,
  reportGenerationQueue,
  usageCalculationQueue,
  billingCycleQueue,
  xenditWebhookQueue,
  graceSweeperQueue,
  registerCronJobs,
} from './queues';

export type {
  TenantJobBase,
  RecordingProcessingJob,
  ReportGenerationJob,
  UsageCalculationJob,
  BillingCycleJob,
  XenditWebhookJob,
  GraceSweeperJob,
} from './queues';

// ─── Workers ──────────────────────────────────────────────────────────────────
export { createRecordingProcessingWorker } from './workers/recording-processing';
export { createReportGenerationWorker } from './workers/report-generation';
export { createUsageCalculationWorker } from './workers/usage-calculation';
export { createBillingCycleWorker } from './workers/billing-cycle';
export {
  createXenditWebhookWorker,
  processXenditWebhookJob,
  type XenditWebhookHandlerDeps,
  type XenditWebhookJobResult,
  type XenditWebhookPrismaClient,
} from './workers/xendit-webhook';
export {
  createGraceSweeperWorker,
  processGraceSweeperJob,
  GRACE_PERIOD_DAYS,
  addDaysUtc,
  type GraceSweeperHandlerDeps,
  type GraceSweeperJobResult,
  type GraceSweeperPrismaClient,
} from './workers/grace-sweeper';
