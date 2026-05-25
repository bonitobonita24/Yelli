-- Phase 8 Item 3 sub-session 3c-ii-b: grace period state machine.
--
-- Adds:
--   1. SubscriptionStatus.suspended enum value
--      (target state for grace_period_end-expired rows; written by
--       packages/jobs/src/workers/grace-sweeper.ts cron worker)
--   2. Subscription.grace_period_end column
--      (set by xendit-webhook on invoice.expired = now + 7 days;
--       scanned by grace-sweeper cron every 6 hours)
--
-- PostgreSQL note: ALTER TYPE ... ADD VALUE cannot be executed inside
-- a transaction in the same statement-batch where the new value is
-- used. Prisma migrate runs each top-level statement in its own
-- transaction by default, which satisfies this constraint without
-- additional --no-transaction directives.

-- AlterEnum
ALTER TYPE "subscription_status" ADD VALUE 'suspended';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "grace_period_end" TIMESTAMP(3);
